import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, MessageCircle, User, Bot, Clock, Send, Loader2, RefreshCw } from "lucide-react";

interface Conversation {
    id: string;
    chatbot_id: string;
    customer_phone: string;
    customer_name: string | null;
    status: 'bot' | 'human' | 'resolved';
    created_at: string;
    last_message_at: string;
}

interface Message {
    id: string;
    content: string;
    direction: 'incoming' | 'outgoing';
    created_at: string;
}

const Conversations = () => {
    const { chatbotId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user } = useAuth();

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>("all");

    useEffect(() => {
        fetchConversations();
    }, [chatbotId, statusFilter]);

    useEffect(() => {
        if (selectedConvo) {
            fetchMessages(selectedConvo.id);
        }
    }, [selectedConvo]);

    // Auto-refresh conversations every 10 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            fetchConversations();
            if (selectedConvo) {
                fetchMessages(selectedConvo.id);
            }
        }, 10000);
        return () => clearInterval(interval);
    }, [chatbotId, selectedConvo, statusFilter]);

    const fetchConversations = async () => {
        try {
            const url = statusFilter === 'all'
                ? `/api/chatbots/${chatbotId}/conversations`
                : `/api/chatbots/${chatbotId}/conversations?status=${statusFilter}`;

            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setConversations(data);
        } catch (error: any) {
            console.error("Error fetching conversations:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchMessages = async (conversationId: string) => {
        try {
            const res = await fetch(`/api/conversations/${conversationId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setMessages(data.messages || []);
        } catch (error: any) {
            console.error("Error fetching messages:", error);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedConvo) return;

        setIsSending(true);
        try {
            const res = await fetch(`/api/conversations/${selectedConvo.id}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: newMessage })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setNewMessage("");
            fetchMessages(selectedConvo.id);
            toast({ title: "Message sent!" });
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsSending(false);
        }
    };

    const handleUpdateStatus = async (newStatus: 'bot' | 'resolved') => {
        if (!selectedConvo) return;

        try {
            const res = await fetch(`/api/conversations/${selectedConvo.id}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast({ title: newStatus === 'resolved' ? "Conversation Resolved" : "Transferred to Bot" });
            setSelectedConvo({ ...selectedConvo, status: newStatus });
            fetchConversations();
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'human':
                return <Badge variant="destructive">Needs Agent</Badge>;
            case 'bot':
                return <Badge variant="secondary">Bot Handling</Badge>;
            case 'resolved':
                return <Badge variant="outline">Resolved</Badge>;
            default:
                return null;
        }
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            return "Today";
        }
        return date.toLocaleDateString();
    };

    return (
        <div className="min-h-screen bg-background">
            <Navbar isAuthenticated onLogout={() => { }} />

            <main className="container py-8">
                <div className="flex items-center gap-4 mb-6">
                    <Button variant="ghost" onClick={() => navigate("/dashboard")}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <h1 className="text-2xl font-bold">Live Conversations</h1>
                    <Button variant="outline" size="sm" onClick={fetchConversations}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Conversations List */}
                    <Card className="lg:col-span-1">
                        <CardHeader className="pb-2">
                            <Tabs defaultValue="all" onValueChange={setStatusFilter}>
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="all">All</TabsTrigger>
                                    <TabsTrigger value="human">
                                        Needs Help
                                    </TabsTrigger>
                                    <TabsTrigger value="resolved">Resolved</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </CardHeader>
                        <CardContent className="p-0">
                            {isLoading ? (
                                <div className="flex justify-center p-8">
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                </div>
                            ) : conversations.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground">
                                    <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p>No conversations yet</p>
                                </div>
                            ) : (
                                <div className="divide-y max-h-[500px] overflow-y-auto">
                                    {conversations.map((convo) => (
                                        <div
                                            key={convo.id}
                                            className={`p-4 cursor-pointer hover:bg-accent transition-colors ${selectedConvo?.id === convo.id ? 'bg-accent' : ''}`}
                                            onClick={() => setSelectedConvo(convo)}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-medium text-sm">
                                                    {convo.customer_name || convo.customer_phone}
                                                </span>
                                                {getStatusBadge(convo.status)}
                                            </div>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Clock className="h-3 w-3" />
                                                {formatDate(convo.last_message_at)} {formatTime(convo.last_message_at)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Chat View */}
                    <Card className="lg:col-span-2">
                        {selectedConvo ? (
                            <>
                                <CardHeader className="border-b">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-lg">
                                                {selectedConvo.customer_name || selectedConvo.customer_phone}
                                            </CardTitle>
                                            <p className="text-sm text-muted-foreground">{selectedConvo.customer_phone}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            {selectedConvo.status === 'human' && (
                                                <>
                                                    <Button variant="outline" size="sm" onClick={() => handleUpdateStatus('bot')}>
                                                        <Bot className="h-4 w-4 mr-1" /> Transfer to Bot
                                                    </Button>
                                                    <Button variant="default" size="sm" onClick={() => handleUpdateStatus('resolved')}>
                                                        Resolve
                                                    </Button>
                                                </>
                                            )}
                                            {selectedConvo.status === 'bot' && (
                                                <Button variant="outline" size="sm" onClick={() => handleUpdateStatus('resolved')}>
                                                    Resolve
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0 flex flex-col h-[400px]">
                                    {/* Messages */}
                                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                        {messages.map((msg) => (
                                            <div
                                                key={msg.id}
                                                className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div
                                                    className={`max-w-[70%] rounded-lg px-4 py-2 ${msg.direction === 'outgoing'
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'bg-muted'
                                                        }`}
                                                >
                                                    <p className="text-sm">{msg.content}</p>
                                                    <p className="text-xs opacity-70 mt-1">{formatTime(msg.created_at)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Input */}
                                    {selectedConvo.status === 'human' && (
                                        <div className="border-t p-4">
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="Type your message..."
                                                    value={newMessage}
                                                    onChange={(e) => setNewMessage(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                                    disabled={isSending}
                                                />
                                                <Button onClick={handleSendMessage} disabled={isSending || !newMessage.trim()}>
                                                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-[500px] text-muted-foreground">
                                <div className="text-center">
                                    <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>Select a conversation to view messages</p>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            </main>
        </div>
    );
};

export default Conversations;
