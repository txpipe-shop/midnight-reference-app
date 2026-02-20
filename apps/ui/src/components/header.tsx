import { useWallet } from "@/contexts/wallet";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { Wallet, LogOut } from "lucide-react";


export function Header() {
    const { wallet, connect, isLoading, error } = useWallet();

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 items-center justify-between mx-auto px-4">
                <div className="flex items-center space-x-4">
                    <span className="font-bold">Midnight dApp</span>
                </div>

                <div className="flex items-center space-x-4">
                    {error && <span className="text-sm text-destructive">{error}</span>}

                    {wallet ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback><Wallet className="h-4 w-4" /></AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56" align="end" forceMount>
                                <DropdownMenuItem>
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Disconnect (Not Implemented)</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <Button onClick={connect} disabled={isLoading}>
                            {isLoading && <Spinner className="mr-2 h-4 w-4" />}
                            Connect Wallet
                        </Button>
                    )}
                </div>
            </div>
        </header>
    );
}
