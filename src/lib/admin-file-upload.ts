// 把图片上传到「文件管理」的虚拟目录（走文件管理的分片上传），并返回可直接使用的图片地址。
//
// 为什么不用 /articles/upload：那个接口的落点固定是后端「文章图片」存储策略挂载的目录，
// 而站点设置里的图片（如站长头像）希望和「我的文件」根目录里的 avatar.avif 同级，
// 所以在文件管理根目录能直接看到。这里用官方文件管理同一套流程：
//   1. GET /file?uri=…            取该目录当前生效的存储策略（上传会话必须带 policy_id）
//   2. PUT /file/upload           建上传会话（server 方式：分片传给后端）
//   3. POST /file/upload/:sid/:i  逐块上传，最后一块传完由后端定稿成文件
//   4. GET /file?uri=…            按文件名找回新文件，拿它的公共 ID
//   5. POST /direct-links         生成公开直链（/api/f/…），写进配置字段
import {
    createAdminDirectLinkApi,
    createAdminUploadSessionApi,
    FILE_ROOT_URI,
    getAdminFilesApi,
    uploadAdminFileChunkApi,
    type AdminFileItem,
} from "@/lib/api";

/** 生成不与现有文件冲突的文件名（沿用后端「时间戳 + 扩展名」的习惯） */
function buildUniqueName(file: File): string {
    const dot = file.name.lastIndexOf(".");
    const ext = dot > 0 ? file.name.slice(dot).toLowerCase() : "";
    return `${Date.now()}${ext}`;
}

/** 从目录列表里取该目录当前生效的存储策略 ID */
async function getFolderPolicyId(uri: string): Promise<string> {
    const data = await getAdminFilesApi({ uri });
    const policy = data?.storage_policy as { id?: string } | undefined;
    if (!policy?.id) throw new Error("该目录没有可用的存储策略，无法上传");
    return policy.id;
}

/** 上传完成后再列一次目录，按文件名找回刚上传的文件（目录同步可能略有延迟，故重试几次） */
async function findFileByName(uri: string, name: string): Promise<AdminFileItem | undefined> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        // 目录列表是游标分页：翻前几页找（正常排序下新文件在第一页，这里只是兜底）
        let nextToken: string | undefined;
        for (let page = 0; page < 3; page += 1) {
            const data = await getAdminFilesApi({ uri, next_token: nextToken });
            const hit = data?.files?.find((item) => item.name === name && item.type === 1);
            if (hit) return hit;
            nextToken = data?.pagination?.next_token;
            if (!nextToken) break;
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
    }
    return undefined;
}

/**
 * 上传一个文件到文件管理目录，返回该文件的公开直链地址（/api/f/…）。
 * @param file 浏览器里选中的文件
 * @param uri 目标目录的虚拟路径（默认「我的文件」根目录，即 anzhiyu://my/）
 */
export async function uploadFileToFileManager(file: File, uri: string = FILE_ROOT_URI): Promise<string> {
    if (file.size === 0) throw new Error("文件内容为空，无法上传");

    const name = buildUniqueName(file);
    const base = uri.endsWith("/") ? uri : `${uri}/`;
    const targetUri = `${base}${name}`;

    // 1 + 2. 取目录策略 → 建上传会话
    const policyId = await getFolderPolicyId(uri);
    const session = await createAdminUploadSessionApi({ uri: targetUri, size: file.size, policy_id: policyId });

    if (session.upload_method !== "server") {
        throw new Error("该目录使用的是浏览器直传的存储策略，暂不支持从这里上传图片");
    }
    if (!session.session_id) throw new Error("创建上传会话失败：后端未返回会话 ID");

    // 3. 逐块上传（一般一张图就是一块）
    const chunkSize = session.chunk_size && session.chunk_size > 0 ? session.chunk_size : file.size;
    const totalChunks = Math.ceil(file.size / chunkSize);
    for (let index = 0; index < totalChunks; index += 1) {
        const chunk = file.slice(index * chunkSize, Math.min((index + 1) * chunkSize, file.size));
        await uploadAdminFileChunkApi(session.session_id, index, chunk);
    }

    // 4 + 5. 找回文件 → 建直链
    const uploaded = await findFileByName(uri, name);
    if (!uploaded?.id) throw new Error("文件已上传，但在目录里没找到它，无法生成图片地址");

    const links = await createAdminDirectLinkApi([uploaded.id]);
    const link = links?.[0]?.link;
    if (!link) throw new Error("生成图片直链失败");
    return link;
}
