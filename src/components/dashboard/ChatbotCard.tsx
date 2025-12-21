import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquare, 
  Settings, 
  Trash2, 
  MoreVertical,
  Zap,
  Building2,
  Play,
  Square,
  Loader2,
  Send,
  Inbox,
  AlertTriangle
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatbotStats } from "@/hooks/useChatbotStats";

interface ChatbotCardProps {
  id: string;
  companyName: string;
  description: string;
  status: "connected" | "disconnected" | "pending";
  model: string;
  tone: string;
  onDelete?: (id: string) => void;
  onToggleStatus?: (id: string, currentStatus: string) => void;
  isTogglingStatus?: boolean;
}

const statusConfig = {
  connected: {
    label: "Running",
    className: "bg-success/10 text-success border-success/20",
  },
  disconnected: {
    label: "Stopped",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  pending: {
    label: "Pending",
    className: "bg-warning/10 text-warning border-warning/20",
  },
};

const ChatbotCard = ({
  id,
  companyName,
  description,
  status,
  model,
  tone,
  onDelete,
  onToggleStatus,
  isTogglingStatus,
}: ChatbotCardProps) => {
  const navigate = useNavigate();
  const statusInfo = statusConfig[status];
  const isRunning = status === "connected";
  const { data: stats, isLoading: statsLoading } = useChatbotStats(id);

  const handleConfigure = () => {
    navigate(`/edit/${id}`);
  };

  const handleEdit = () => {
    navigate(`/edit/${id}`);
  };

  return (
    <Card className="group relative overflow-hidden border border-border/50 bg-card hover:shadow-lg hover:border-primary/20 transition-all duration-300">
      <div className="absolute inset-0 gradient-primary opacity-0 group-hover:opacity-[0.02] transition-opacity duration-300 pointer-events-none" />
      
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary">
            <Building2 className="h-5 w-5 text-foreground/70" />
          </div>
          <div>
            <h3 className="font-heading font-semibold text-foreground leading-tight">
              {companyName}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={statusInfo.className}>
                <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
                  status === "connected" ? "bg-success animate-pulse-soft" : 
                  status === "pending" ? "bg-warning" : "bg-destructive"
                }`} />
                {statusInfo.label}
              </Badge>
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleEdit}>
              <Settings className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onDelete?.(id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {description}
        </p>

        {/* Stats Section */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-secondary/50 rounded-lg">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Inbox className="h-3.5 w-3.5" />
              <span className="text-xs">Received</span>
            </div>
            <span className="text-lg font-semibold text-foreground">
              {statsLoading ? "-" : stats?.messagesReceived || 0}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Send className="h-3.5 w-3.5" />
              <span className="text-xs">Sent</span>
            </div>
            <span className="text-lg font-semibold text-foreground">
              {statsLoading ? "-" : stats?.messagesSent || 0}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="text-xs">Errors</span>
            </div>
            <span className={`text-lg font-semibold ${stats?.errorCount && stats.errorCount > 0 ? "text-destructive" : "text-foreground"}`}>
              {statsLoading ? "-" : stats?.errorCount || 0}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-xs">
            <Zap className="h-3 w-3 mr-1" />
            {model}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <MessageSquare className="h-3 w-3 mr-1" />
            {tone}
          </Badge>
        </div>

        <div className="flex gap-2 pt-2">
          <Button 
            variant={isRunning ? "destructive" : "default"}
            size="sm" 
            className="flex-1"
            onClick={() => onToggleStatus?.(id, status)}
            disabled={isTogglingStatus}
          >
            {isTogglingStatus ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRunning ? (
              <>
                <Square className="h-4 w-4 mr-1" />
                Stop Bot
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1" />
                Start Bot
              </>
            )}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={handleConfigure}
          >
            <Settings className="h-4 w-4 mr-1" />
            Configure
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ChatbotCard;
