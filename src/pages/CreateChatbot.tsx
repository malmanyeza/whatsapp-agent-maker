import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useChatbots, CreateChatbotData } from "@/hooks/useChatbots";
import {
  Building2,
  MessageSquare,
  Key,
  Bot,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const CreateChatbot = () => {
  const navigate = useNavigate();
  // ... (existing hooks)

  // ... (handleLogoUpload)

  const handleSyncProfile = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      toast({ title: "Syncing Profile...", description: "Updating WhatsApp Business Profile on Meta..." });

      const res = await fetch('/api/sync-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatbotId: id })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync Failed");

      toast({
        title: "Profile Synced!",
        description: `Photo: ${data.results.photo}, Name: ${data.results.displayName}, About: ${data.results.about}`
      });

    } catch (error: any) {
      toast({ title: "Sync Error", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncProfile = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      toast({ title: "Syncing Profile...", description: "Updating WhatsApp Business Profile on Meta..." });

      const res = await fetch('/api/sync-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatbotId: id })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync Failed");

      toast({
        title: "Profile Synced!",
        description: `Photo: ${data.results.photo}, Name: ${data.results.displayName}, About: ${data.results.about}`
      });

    } catch (error: any) {
      toast({ title: "Sync Error", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    // ...
  };
  // ...
  // In JSX Header:
  {/* Header */ }
  <div className="mb-8 animate-fade-in flex flex-col md:flex-row md:items-center md:justify-between gap-4">
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/dashboard")}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Dashboard
      </Button>

      <h1 className="font-heading text-3xl font-bold text-foreground">
        {isEditing ? "Edit Chatbot" : "Create New Chatbot"}
      </h1>
      <p className="text-muted-foreground mt-1">
        {isEditing ? "Update your AI-powered WhatsApp assistant" : "Set up your AI-powered WhatsApp assistant"}
      </p>
    </div>

    {isEditing && (
      <Button onClick={handleSyncProfile} disabled={isLoading} variant="outline" className="gap-2">
        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        Sync Profile
      </Button>
    )}
  </div>

  {/* Progress Steps */ }
  <div className="flex items-center justify-between mb-8 animate-slide-up">
    {steps.map((step, index) => (
      <div key={step.id} className="flex items-center">
        <button
          type="button"
          onClick={() => setCurrentStep(step.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${currentStep === step.id
            ? "bg-primary text-primary-foreground shadow-md"
            : currentStep > step.id
              ? "bg-primary/10 text-primary"
              : "bg-secondary text-muted-foreground"
            }`}
        >
          <step.icon className="h-4 w-4" />
          <span className="hidden sm:inline text-sm font-medium">{step.title}</span>
        </button>
        {index < steps.length - 1 && (
          <div className={`w-8 lg:w-16 h-0.5 mx-2 ${currentStep > step.id ? "bg-primary" : "bg-border"
            }`} />
        )}
      </div>
    ))}
  </div>

  {/* Form Card */ }
  <Card className="border-border/50 shadow-lg animate-slide-up">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        {currentStep === 1 && <Building2 className="h-5 w-5 text-primary" />}
        {currentStep === 2 && <MessageSquare className="h-5 w-5 text-primary" />}
        {currentStep === 3 && <Key className="h-5 w-5 text-primary" />}
        {currentStep === 4 && <Bot className="h-5 w-5 text-primary" />}
        {steps.find(s => s.id === currentStep)?.title}
      </CardTitle>
      <CardDescription>
        {currentStep === 1 && "Tell us about your business"}
        {currentStep === 2 && "Connect your WhatsApp Business account"}
        {currentStep === 3 && "Configure your AI provider"}
        {currentStep === 4 && "Customize your assistant's behavior"}
      </CardDescription>
    </CardHeader>

    <CardContent>
      <form onSubmit={handleSubmit}>
        {renderStep()}

        <div className="flex justify-between mt-8 pt-6 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentStep(prev => prev - 1)}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          {currentStep < 4 ? (
            <Button
              type="button"
              onClick={() => setCurrentStep(prev => prev + 1)}
            >
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button type="submit" variant="gradient" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  {isEditing ? "Save Changes" : "Deploy Chatbot"}
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </CardContent>
  </Card>
      </main >
    </div >
  );
};

export default CreateChatbot;
