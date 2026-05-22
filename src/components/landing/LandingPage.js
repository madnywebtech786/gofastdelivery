'use client'
import Navbar from './Navbar'
import HeroSlider from './HeroSlider'
import AboutSection from './AboutSection'
import ServicesSection from './ServicesSection'
import WhyUsSection from './WhyUsSection'
import ServiceAreasSection from './ServiceAreasSection'
import ProcessSection from './ProcessSection'
import CTASection from './CTASection'
import ReviewsSection from './ReviewsSection'
import ContactSection from './ContactSection'
import Footer from './Footer'
import SocialDock from './SocialDock'

export default function LandingPage() {
  return (
    <div data-page="landing">
      <Navbar />
      <SocialDock />
      <main>
        <HeroSlider />
        <AboutSection />
        <ServicesSection />
        <ProcessSection />
        <WhyUsSection />
        <ServiceAreasSection />
        <CTASection />
        <ReviewsSection />
        <ContactSection />
      </main>
      <Footer />
    </div>
  )
}
