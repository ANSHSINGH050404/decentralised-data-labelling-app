"use client";
import { Appbar } from "@/components/Appbar";
import { NextTask } from "@/components/NextTask";


export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
      <Appbar />
      <NextTask/>
    </main>
  );
}
