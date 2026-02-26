import { useWallet } from "@/contexts/wallet";
import {
    Sidebar,
    SidebarContent,
    SidebarHeader,
    SidebarGroup,
    SidebarGroupContent,
} from "@/components/ui/sidebar";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

function DisplayValue({ value }: { value: any }) {
    if (value === undefined || value === null) {
        return <span className="italic text-muted-foreground">--</span>;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return <span className="text-foreground">{String(value)}</span>;
    }
    return (
        <pre className="whitespace-pre-wrap font-mono text-xs overflow-x-auto bg-muted p-3 rounded-md border text-muted-foreground">
            {JSON.stringify(value, (_key, val) =>
                typeof val === 'bigint' ? val.toString() : val, 2)}
        </pre>
    );
}

const formatLabel = (key: string) => {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
};

export function WalletSidebar() {
    const { wallet } = useWallet();

    if (!wallet) {
        return null;
    }

    const { details } = wallet;
    const entries = Object.entries(details);

    return (
        <Sidebar side="right">
            <SidebarHeader>
                <div className="font-bold px-4 py-4 border-b">Wallet Details</div>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <Accordion type="multiple" className="w-full">
                            {entries.map(([key, value]) => (
                                <AccordionItem value={key} key={key} className="border-b-0 px-2">
                                    <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
                                        {formatLabel(key)}
                                    </AccordionTrigger>
                                    <AccordionContent className="pb-3 text-sm break-all">
                                        <DisplayValue value={value} />
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
}
