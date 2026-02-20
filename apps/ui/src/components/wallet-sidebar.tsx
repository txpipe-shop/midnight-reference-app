import { useWallet } from "@/contexts/wallet";
import {
    Sidebar,
    SidebarContent,
    SidebarHeader,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
} from "@/components/ui/sidebar";

function DisplayValue({ value }: { value: any }) {
    if (value === undefined || value === null) {
        return <span className="italic">--</span>;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return <>{String(value)}</>;
    }
    return (
        <pre className="whitespace-pre-wrap font-mono text-xs">
            {JSON.stringify(value, (_key, val) =>
                typeof val === 'bigint' ? val.toString() : val, 2)}
        </pre>
    );
}

export function WalletSidebar() {
    const { wallet } = useWallet();

    if (!wallet) {
        return null;
    }

    const { details } = wallet;

    return (
        <Sidebar side="right">
            <SidebarHeader>
                <div className="font-bold px-4 py-4 border-b">Wallet Details</div>
            </SidebarHeader>
            <SidebarContent>

                <SidebarGroup>
                    <SidebarGroupLabel>Connection Status</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <div className="p-2 px-2 text-sm text-muted-foreground break-all">
                            <DisplayValue value={details.connectionStatus} />
                        </div>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Configuration</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <div className="p-2 px-2 text-sm text-muted-foreground break-all">
                            <DisplayValue value={details.configuration} />
                        </div>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Dust Address</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <div className="p-2 px-2 text-sm text-muted-foreground break-all">
                            <DisplayValue value={details.dustAddress} />
                        </div>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Dust Balance</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <div className="p-2 px-2 text-sm text-muted-foreground break-all">
                            <DisplayValue value={details.dustBalance} />
                        </div>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Shielded Addresses</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <div className="p-2 px-2 text-sm text-muted-foreground break-all">
                            <DisplayValue value={details.shieldedAddress} />
                        </div>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Shielded Balances</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <div className="p-2 px-2 text-sm text-muted-foreground break-all">
                            <DisplayValue value={details.shieldedBalances} />
                        </div>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Unshielded Address</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <div className="p-2 px-2 text-sm text-muted-foreground break-all">
                            <DisplayValue value={details.unshieldedAddress} />
                        </div>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Unshielded Balances</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <div className="p-2 px-2 text-sm text-muted-foreground break-all">
                            <DisplayValue value={details.unshieldedBalances} />
                        </div>
                    </SidebarGroupContent>
                </SidebarGroup>

            </SidebarContent>
        </Sidebar>
    );
}
