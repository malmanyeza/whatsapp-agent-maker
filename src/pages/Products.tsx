
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";

interface Product {
    id: string;
    name: string;
    description: string;
    unit_price: number;
    currency: string;
    image_url?: string;
}

const Products = () => {
    const { chatbotId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user } = useAuth();

    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        unit_price: "",
        currency: "USD"
    });
    const [imageFile, setImageFile] = useState<File | null>(null);

    useEffect(() => {
        fetchProducts();
    }, [chatbotId]);

    const fetchProducts = async () => {
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('chatbot_id', chatbotId)
                .order('name');

            if (error) throw error;
            setProducts(data || []);
        } catch (error) {
            console.error("Error fetching products:", error);
            toast({
                title: "Error",
                description: "Could not load products",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let imageUrl = editingProduct?.image_url || null;

            // Upload image if one was selected
            if (imageFile) {
                const fileName = `${chatbotId}/${Date.now()}_${imageFile.name}`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(fileName, imageFile);

                if (uploadError) throw uploadError;

                // Get public URL
                const { data } = supabase.storage
                    .from('product-images')
                    .getPublicUrl(fileName);

                imageUrl = data.publicUrl;
            }

            if (editingProduct) {
                const { error } = await supabase
                    .from('products')
                    .update({
                        name: formData.name,
                        description: formData.description,
                        unit_price: parseFloat(formData.unit_price),
                        currency: formData.currency,
                        image_url: imageUrl
                    })
                    .eq('id', editingProduct.id);

                if (error) throw error;
                toast({ title: "Product Updated" });
            } else {
                const { error } = await supabase
                    .from('products')
                    .insert({
                        chatbot_id: chatbotId,
                        name: formData.name,
                        description: formData.description,
                        unit_price: parseFloat(formData.unit_price),
                        currency: formData.currency,
                        image_url: imageUrl
                    });

                if (error) throw error;
                toast({ title: "Product Added" });
            }

            setIsDialogOpen(false);
            resetForm();
            fetchProducts();
        } catch (error) {
            toast({ title: "Error", description: "Failed to save product", variant: "destructive" });
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this product?")) return;

        try {
            const { error } = await supabase.from('products').delete().eq('id', id);
            if (error) throw error;
            toast({ title: "Product Deleted" });
            fetchProducts();
        } catch (error) {
            toast({ title: "Error", description: "Failed to delete product", variant: "destructive" });
        }
    };

    const resetForm = () => {
        setFormData({ name: "", description: "", unit_price: "", currency: "USD" });
        setImageFile(null);
        setEditingProduct(null);
    };

    const openEdit = (product: Product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name,
            description: product.description || "",
            unit_price: product.unit_price.toString(),
            currency: product.currency
        });
        setIsDialogOpen(true);
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-background">
            <Navbar isAuthenticated onLogout={() => { }} />

            <main className="container py-8 max-w-5xl">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Button variant="ghost" className="mb-2" onClick={() => navigate("/dashboard")}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                        </Button>
                        <h1 className="text-3xl font-bold">Product Inventory</h1>
                        <p className="text-muted-foreground">Manage products for this chatbot</p>
                    </div>
                    <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" /> Add Product
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Product Name</Label>
                                    <Input
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. Gloss Enamel 5L"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Description</Label>
                                    <Input
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="e.g. High quality interior paint"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Price</Label>
                                        <Input
                                            required
                                            type="number"
                                            step="0.01"
                                            value={formData.unit_price}
                                            onChange={e => setFormData({ ...formData, unit_price: e.target.value })}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Currency</Label>
                                        <Input
                                            required
                                            value={formData.currency}
                                            onChange={e => setFormData({ ...formData, currency: e.target.value })}
                                            placeholder="USD"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Product Image (optional)</Label>
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={e => setImageFile(e.target.files?.[0] || null)}
                                    />
                                    {editingProduct?.image_url && !imageFile && (
                                        <p className="text-sm text-muted-foreground">Current image will be kept unless you upload a new one</p>
                                    )}
                                </div>
                                <Button type="submit" className="w-full">Save Product</Button>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="flex items-center space-x-2 mb-4">
                    <Search className="text-muted-foreground h-4 w-4" />
                    <Input
                        placeholder="Search products..."
                        className="max-w-sm"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="border rounded-lg overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Image</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Price</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : filteredProducts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                        No products found. Add one to get started.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredProducts.map(product => (
                                    <TableRow key={product.id}>
                                        <TableCell>
                                            {product.image_url ? (
                                                <img src={product.image_url} alt={product.name} className="h-10 w-10 object-cover rounded" />
                                            ) : (
                                                <div className="h-10 w-10 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">No img</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-medium">{product.name}</TableCell>
                                        <TableCell>{product.description}</TableCell>
                                        <TableCell>{product.currency} {product.unit_price}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => openEdit(product)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(product.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </main>
        </div>
    );
};

export default Products;
