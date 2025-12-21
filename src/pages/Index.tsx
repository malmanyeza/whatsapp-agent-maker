import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/layout/Navbar";
import { 
  MessageSquare, 
  Zap, 
  Shield, 
  Bot, 
  ArrowRight,
  CheckCircle2,
  Building2,
  Users,
  TrendingUp
} from "lucide-react";

const features = [
  {
    icon: Bot,
    title: "AI-Powered Conversations",
    description: "Leverage GPT-4 to create intelligent sales assistants that understand context and provide personalized responses."
  },
  {
    icon: Zap,
    title: "Instant Setup",
    description: "Connect your WhatsApp Business account in minutes. No coding required, just configure and deploy."
  },
  {
    icon: Shield,
    title: "Secure & Reliable",
    description: "Your API keys are encrypted. Each chatbot runs independently with its own credentials."
  }
];

const benefits = [
  "24/7 customer support automation",
  "Lead capture and qualification",
  "Personalized product recommendations",
  "Multi-language support",
  "Conversation analytics",
  "Human handoff when needed"
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden gradient-hero">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(158,64%,42%,0.08),transparent_50%)]" />
        
        <div className="container relative py-20 md:py-32">
          <div className="mx-auto max-w-3xl text-center animate-fade-in">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-6">
              <Zap className="h-4 w-4" />
              AI-Powered WhatsApp Automation
            </div>
            
            <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-6">
              Transform Your
              <span className="block text-primary">Customer Conversations</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Build intelligent WhatsApp chatbots that sell, support, and engage your customers 24/7. 
              No code required.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button variant="gradient" size="xl" asChild>
                <Link to="/auth?mode=signup">
                  Start Free Trial
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <Button variant="outline" size="xl" asChild>
                <Link to="/auth">
                  Sign In
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y border-border/50 bg-card/50">
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: Building2, value: "1,000+", label: "Businesses Trust Us" },
              { icon: Users, value: "5M+", label: "Conversations Handled" },
              { icon: TrendingUp, value: "40%", label: "Average Sales Increase" }
            ].map((stat, index) => (
              <div key={index} className="flex items-center justify-center gap-4 text-center animate-slide-up" style={{ animationDelay: `${index * 100}ms` }}>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <stat.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-heading text-2xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 md:py-28">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-4">
              Everything You Need
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Powerful features to help you build, deploy, and manage your AI sales assistants.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="group relative p-6 rounded-2xl border border-border/50 bg-card hover:shadow-lg hover:border-primary/20 transition-all duration-300 animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-secondary/30">
        <div className="container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-6">
                Automate Your Sales <br />
                <span className="text-primary">Without Losing the Human Touch</span>
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Our AI assistants are trained to understand context, maintain conversation flow, 
                and know when to escalate to a human agent.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-sm text-foreground">{benefit}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <Button variant="gradient" size="lg" asChild>
                  <Link to="/auth?mode=signup">
                    Get Started Now
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="relative">
              <div className="aspect-square rounded-2xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-8 border border-primary/10">
                <div className="h-full rounded-xl bg-card shadow-xl border border-border/50 p-6 flex flex-col">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <div className="h-10 w-10 rounded-full gradient-primary flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <div className="font-semibold text-foreground text-sm">AI Sales Assistant</div>
                      <div className="text-xs text-muted-foreground">Online</div>
                    </div>
                  </div>
                  
                  <div className="flex-1 py-4 space-y-4">
                    <div className="flex justify-end">
                      <div className="bg-primary/10 text-foreground text-sm rounded-2xl rounded-tr-none px-4 py-2 max-w-[80%]">
                        Hi! I'm interested in your services
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="bg-secondary text-foreground text-sm rounded-2xl rounded-tl-none px-4 py-2 max-w-[80%]">
                        Hello! I'd be happy to help. What specific service are you looking for?
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="bg-primary/10 text-foreground text-sm rounded-2xl rounded-tr-none px-4 py-2 max-w-[80%]">
                        I need a quote for web development
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-4 border-t border-border">
                    <div className="flex-1 h-10 rounded-full bg-secondary" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container">
          <div className="relative rounded-3xl gradient-primary p-8 md:p-12 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(255,255,255,0.1),transparent_60%)]" />
            
            <div className="relative text-center">
              <h2 className="font-heading text-2xl md:text-3xl font-bold text-primary-foreground mb-4">
                Ready to Supercharge Your WhatsApp?
              </h2>
              <p className="text-primary-foreground/80 max-w-xl mx-auto mb-6">
                Join thousands of businesses automating their customer conversations with AI.
              </p>
              <Button variant="secondary" size="lg" asChild>
                <Link to="/auth?mode=signup">
                  Start Your Free Trial
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
              <MessageSquare className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-heading font-semibold text-foreground">BotForge</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2024 BotForge. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
