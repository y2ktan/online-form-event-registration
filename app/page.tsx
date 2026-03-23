import Link from "next/link";
import { FileText, LogIn } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 font-sans">
      <main className="flex w-full max-w-3xl flex-col items-center gap-8 px-6 text-center">
        <div className="rounded-full bg-indigo-100 p-4">
          <FileText className="h-12 w-12 text-indigo-600" />
        </div>
        
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
          Dynamic Form Builder
        </h1>
        
        <p className="max-w-xl text-lg leading-8 text-gray-600">
          Create, manage, and distribute dynamic forms easily. Custom admin dashboard with advanced question types and response management.
        </p>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <LogIn className="h-4 w-4" />
            Admin Login
          </Link>
        </div>
      </main>
    </div>
  );
}
