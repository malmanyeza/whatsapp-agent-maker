import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageSquare, Plus, Sparkles } from "lucide-react";

const EmptyState = () => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      <div className="relative mb-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-secondary">
          <MessageSquare className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full gradient-primary shadow-glow">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
      </div>

      <h3 className="font-heading text-xl font-semibold text-foreground mb-2">
        No chatbots yet
      </h3>
      <p className="text-muted-foreground max-w-sm mb-6">
        Create your first AI-powered WhatsApp chatbot to start engaging with your customers automatically.
      </p>

      <Button variant="gradient" size="lg" asChild>
        <Link to="/create">
          <Plus className="h-5 w-5" />
          Create Your First Bot
        </Link>
      </Button>
    </div>
  );
};

export default EmptyState;
