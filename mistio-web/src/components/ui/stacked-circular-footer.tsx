import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Facebook, Instagram, Linkedin, Twitter } from "lucide-react"

function StackedCircularFooter() {
  return (
    <footer className="bg-mistio-dark py-16 text-white border-t border-slate-800">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center text-center">
          {/* Logo Section */}
          <div className="mb-8 p-4">
            <img src="/logo.png" alt="Mistio Logo" className="h-32 w-auto brightness-0 invert" />
          </div>
          
          {/* Navigation */}
          <nav className="mb-8 flex flex-wrap justify-center gap-8 text-sm font-medium">
            <a href="#home" className="text-slate-300 hover:text-mistio-teal transition-colors">Home</a>
            <a href="#features" className="text-slate-300 hover:text-mistio-teal transition-colors">Features</a>
            <a href="#testimonials" className="text-slate-300 hover:text-mistio-teal transition-colors">Testimonials</a>
            <a href="#contact" className="text-slate-300 hover:text-mistio-teal transition-colors">Contact</a>
          </nav>

          {/* Social Icons */}
          <div className="mb-10 flex space-x-4">
            <SocialButton icon={<Facebook className="h-4 w-4" />} label="Facebook" />
            <SocialButton icon={<Twitter className="h-4 w-4" />} label="Twitter" />
            <SocialButton icon={<Instagram className="h-4 w-4" />} label="Instagram" />
            <SocialButton icon={<Linkedin className="h-4 w-4" />} label="LinkedIn" />
          </div>

          {/* Newsletter (Optional - keeping simplified) */}
          <div className="mb-12 w-full max-w-md">
            <p className="mb-4 text-sm text-slate-400">Stay updated with our latest safety features.</p>
            <form className="flex space-x-2">
              <div className="flex-grow">
                <Input 
                  placeholder="Enter your email" 
                  type="email" 
                  className="rounded-full bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-mistio-teal focus:ring-mistio-teal" 
                />
              </div>
              <Button type="submit" className="rounded-full bg-mistio-teal hover:bg-teal-600 text-white border-none">
                Subscribe
              </Button>
            </form>
          </div>

          {/* Copyright */}
          <div className="pt-8 border-t border-slate-800 w-full max-w-4xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
                <p>© 2025 Mistio. All rights reserved.</p>
                <div className="flex gap-6">
                    <a href="#" className="hover:text-slate-300">Privacy Policy</a>
                    <a href="#" className="hover:text-slate-300">Terms of Service</a>
                </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

const SocialButton = ({ icon, label }: { icon: React.ReactNode, label: string }) => (
    <Button variant="outline" size="icon" className="rounded-full border-slate-700 bg-transparent text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
)

export { StackedCircularFooter }


