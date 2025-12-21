import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import ChatbotCard from "@/components/dashboard/ChatbotCard";
import EmptyState from "@/components/dashboard/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useChatbots } from "@/hooks/useChatbots";
import { useState } from "react";

const Dashboard = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, signOut, isLoading: authLoading } = useAuth();
  const { chatbots, isLoading: chatbotsLoading, deleteChatbot, toggleChatbotStatus } = useChatbots();

  // Redirect if not logged in
  useEffect(() => {
    if (!user && !authLoading) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const handleDelete = (id: string) => {
    deleteChatbot.mutate(id);
  };

  const handleToggleStatus = (id: string, currentStatus: string) => {
    setTogglingId(id);
    toggleChatbotStatus.mutate(
      { id, currentStatus },
      {
        onSettled: () => setTogglingId(null),
      }
    );
  };

  const filteredChatbots = chatbots.filter(bot =>
    bot.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bot.company_description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading || chatbotsLoading) {
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

      <main className="container py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 animate-fade-in">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">
              Your Chatbots
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage and monitor your AI-powered WhatsApp assistants
            </p>
          </div>
          
          <Button variant="gradient" asChild>
            <Link to="/create">
              <Plus className="h-5 w-5" />
              Create New Bot
            </Link>
          </Button>
        </div>

        {chatbots.length > 0 ? (
          <>
            {/* Search */}
            <div className="relative max-w-md mb-6 animate-slide-up">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search chatbots..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Chatbot Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredChatbots.map((bot, index) => (
                <div
                  key={bot.id}
                  className="animate-slide-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <ChatbotCard 
                    id={bot.id}
                    companyName={bot.company_name}
                    description={bot.company_description}
                    status={bot.status}
                    model={bot.model}
                    tone={bot.tone}
                    onDelete={handleDelete}
                    onToggleStatus={handleToggleStatus}
                    isTogglingStatus={togglingId === bot.id}
                  />
                </div>
              ))}
            </div>

            {filteredChatbots.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No chatbots match your search.</p>
              </div>
            )}
          </>
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
};

export default Dashboard;
