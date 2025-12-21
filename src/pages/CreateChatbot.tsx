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
  Sparkles
} from "lucide-react";

const CreateChatbot = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { user, signOut, isLoading: authLoading } = useAuth();
  const { createChatbot, updateChatbot, getChatbot } = useChatbots();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [currentStep, setCurrentStep] = useState(1);
  const isEditing = !!id;

  const [formData, setFormData] = useState({
    company_name: "",
    company_description: "",
    services_offered: "",
    whatsapp_phone_number_id: "",
    meta_app_id: "",
    meta_app_secret: "",
    access_token: "",
    openai_api_key: "",
    model: "gpt-4o-mini",
    system_instructions: "",
    tone: "professional",
    allowed_actions: {
      answerQuestions: true,
      generateQuotations: false,
      collectLeads: true,
    },
  });

  // Redirect if not logged in
  useEffect(() => {
    if (!user && !authLoading) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Fetch chatbot data if editing
  useEffect(() => {
    const fetchChatbot = async () => {
      if (id && user) {
        setIsFetching(true);
        try {
          const chatbot = await getChatbot(id);
          if (chatbot) {
            setFormData({
              company_name: chatbot.company_name,
              company_description: chatbot.company_description,
              services_offered: chatbot.services_offered,
              whatsapp_phone_number_id: chatbot.whatsapp_phone_number_id,
              meta_app_id: chatbot.meta_app_id,
              meta_app_secret: chatbot.meta_app_secret,
              access_token: chatbot.access_token,
              openai_api_key: chatbot.openai_api_key,
              model: chatbot.model,
              system_instructions: chatbot.system_instructions,
              tone: chatbot.tone,
              allowed_actions: chatbot.allowed_actions,
            });
          } else {
            toast({
              title: "Chatbot not found",
              description: "The chatbot you're trying to edit doesn't exist.",
              variant: "destructive",
            });
            navigate("/dashboard");
          }
        } catch (error) {
          toast({
            title: "Error loading chatbot",
            description: "Failed to load chatbot data.",
            variant: "destructive",
          });
        } finally {
          setIsFetching(false);
        }
      }
    };
    fetchChatbot();
  }, [id, user]);

  const toggleSecret = (field: string) => {
    setShowSecrets(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleChange = (field: string, value: string | boolean) => {
    if (field.startsWith("allowed_actions.")) {
      const action = field.split(".")[1];
      setFormData(prev => ({
        ...prev,
        allowed_actions: {
          ...prev.allowed_actions,
          [action]: value,
        },
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isEditing) {
        await updateChatbot.mutateAsync({ id, ...formData });
      } else {
        await createChatbot.mutateAsync(formData as CreateChatbotData);
      }
      navigate("/dashboard");
    } catch (error) {
      // Error handling is done in the mutation
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const steps = [
    { id: 1, title: "Company Info", icon: Building2 },
    { id: 2, title: "WhatsApp", icon: MessageSquare },
    { id: 3, title: "OpenAI", icon: Key },
    { id: 4, title: "Agent Config", icon: Bot },
  ];

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name *</Label>
              <Input
                id="company_name"
                placeholder="Enter your company name"
                value={formData.company_name}
                onChange={(e) => handleChange("company_name", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company_description">Company Description *</Label>
              <Textarea
                id="company_description"
                placeholder="Briefly describe what your company does..."
                value={formData.company_description}
                onChange={(e) => handleChange("company_description", e.target.value)}
                rows={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="services_offered">Services Offered *</Label>
              <Textarea
                id="services_offered"
                placeholder="List the services your business offers. Be detailed - this helps the AI provide accurate information."
                value={formData.services_offered}
                onChange={(e) => handleChange("services_offered", e.target.value)}
                rows={5}
                required
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 mb-4">
              <p className="text-sm text-muted-foreground">
                You'll need a WhatsApp Business account and Meta Developer credentials.
                These can be obtained from the Meta Developer Portal.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp_phone_number_id">Phone Number ID *</Label>
              <Input
                id="whatsapp_phone_number_id"
                placeholder="e.g., 123456789012345"
                value={formData.whatsapp_phone_number_id}
                onChange={(e) => handleChange("whatsapp_phone_number_id", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meta_app_id">Meta App ID *</Label>
              <Input
                id="meta_app_id"
                placeholder="e.g., 123456789012345"
                value={formData.meta_app_id}
                onChange={(e) => handleChange("meta_app_id", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meta_app_secret">Meta App Secret *</Label>
              <div className="relative">
                <Input
                  id="meta_app_secret"
                  type={showSecrets.meta_app_secret ? "text" : "password"}
                  placeholder="Enter your Meta App Secret"
                  value={formData.meta_app_secret}
                  onChange={(e) => handleChange("meta_app_secret", e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                  onClick={() => toggleSecret("meta_app_secret")}
                >
                  {showSecrets.meta_app_secret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="access_token">Access Token *</Label>
              <div className="relative">
                <Input
                  id="access_token"
                  type={showSecrets.access_token ? "text" : "password"}
                  placeholder="Enter your Access Token"
                  value={formData.access_token}
                  onChange={(e) => handleChange("access_token", e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                  onClick={() => toggleSecret("access_token")}
                >
                  {showSecrets.access_token ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 mb-4">
                <p className="text-sm text-muted-foreground">
                  The OpenAI API key is managed via the Render dashboard for security.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">AI Model *</Label>
                <Select
                  value={formData.model}
                  onValueChange={(value) => handleChange("model", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini (Fast & Affordable)</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o (Most Capable)</SelectItem>
                    <SelectItem value="gpt-4-turbo">GPT-4 Turbo (Balanced)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  GPT-4o Mini is recommended for most use cases.
                </p>
              </div>

              {/* External Data Source */}
              <div className="pt-4 border-t border-border mt-4">
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <span className="bg-primary/10 p-1 rounded"><Bot className="h-3 w-3 text-primary" /></span>
                  Product Data Integration
                </h3>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="external_product_api_url">External Product API URL (Optional)</Label>
                    <Input
                      id="external_product_api_url"
                      placeholder="https://api.yourcompany.com/products"
                      value={(formData as any).external_product_api_url || ""}
                      onChange={(e) => handleChange("external_product_api_url", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      If provided, the AI will fetch pricing from this API. If empty, it uses the manual product list.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="external_product_api_key">API Key / Header (Optional)</Label>
                    <Input
                      id="external_product_api_key"
                      type="password"
                      placeholder="Authorization Bearer token..."
                      value={(formData as any).external_product_api_key || ""}
                      onChange={(e) => handleChange("external_product_api_key", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="system_instructions">System Instructions *</Label>
              <Textarea
                id="system_instructions"
                placeholder="Define how your AI assistant should behave. For example:

You are a helpful sales assistant for [Company]. Your role is to:
- Answer questions about our services
- Provide pricing information
- Schedule consultations
- Collect customer contact information

Always be polite, professional, and helpful..."
                value={formData.system_instructions}
                onChange={(e) => handleChange("system_instructions", e.target.value)}
                rows={8}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tone">Conversation Tone *</Label>
              <Select
                value={formData.tone}
                onValueChange={(value) => handleChange("tone", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a tone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="sales-focused">Sales-focused</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Allowed Actions</Label>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="answerQuestions"
                  checked={formData.allowed_actions.answerQuestions}
                  onCheckedChange={(checked) => handleChange("allowed_actions.answerQuestions", checked as boolean)}
                />
                <Label htmlFor="answerQuestions" className="font-normal cursor-pointer">
                  Answer Questions
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="generateQuotations"
                  checked={formData.allowed_actions.generateQuotations}
                  onCheckedChange={(checked) => handleChange("allowed_actions.generateQuotations", checked as boolean)}
                />
                <Label htmlFor="generateQuotations" className="font-normal cursor-pointer">
                  Generate Quotations
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="collectLeads"
                  checked={formData.allowed_actions.collectLeads}
                  onCheckedChange={(checked) => handleChange("allowed_actions.collectLeads", checked as boolean)}
                />
                <Label htmlFor="collectLeads" className="font-normal cursor-pointer">
                  Collect Leads
                </Label>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (authLoading || isFetching) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar isAuthenticated onLogout={handleLogout} />

      <main className="container py-8 max-w-3xl">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
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

        {/* Progress Steps */}
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

        {/* Form Card */}
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
      </main>
    </div>
  );
};

export default CreateChatbot;
