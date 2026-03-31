import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function ShortFormRedirect({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;

  const form = await prisma.form.findFirst({
    where: { shortCode: shortCode.toUpperCase() },
    select: { id: true },
  });

  if (!form) {
    notFound();
  }

  redirect(`/form/${form.id}`);
}
