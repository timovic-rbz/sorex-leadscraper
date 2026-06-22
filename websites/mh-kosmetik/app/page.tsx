import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { TrustStrip } from "@/components/TrustStrip";
import { Leistungen } from "@/components/Leistungen";
import { UeberUns } from "@/components/UeberUns";
import { Testimonials } from "@/components/Testimonials";
import { CTA } from "@/components/CTA";
import { ValuesStrip } from "@/components/ValuesStrip";
import { Footer } from "@/components/Footer";

export default function Page() {
  return (
    <main className="relative">
      <Header />
      <Hero />
      <TrustStrip />
      <Leistungen />
      <UeberUns />
      <Testimonials />
      <CTA />
      <ValuesStrip />
      <Footer />
    </main>
  );
}
