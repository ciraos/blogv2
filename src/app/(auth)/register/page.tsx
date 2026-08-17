import type { Metadata } from "next";

import { RegisterPage } from "@/components/(auth)/registerpage";

import { generateBlogMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
    return generateBlogMetadata("注册");
}

export default async function Register() {
    return (
        <>
            <RegisterPage />
        </>
    )
}
