import { Everywhere } from "@/components/everywhere";
import { ExportSpec } from "@/components/export-spec";
import { Faq } from "@/components/faq";
import { Finale } from "@/components/finale";
import { Hero } from "@/components/hero";
import { Manifesto } from "@/components/manifesto";
import { Nav } from "@/components/nav";
import { Toolkit } from "@/components/toolkit";
import { Unlocked } from "@/components/unlocked";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Manifesto />
        <Unlocked />
        <Toolkit />
        <ExportSpec />
        <Everywhere />
        <Faq />
      </main>
      <Finale />
    </>
  );
}
