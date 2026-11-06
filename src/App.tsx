import { useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain } from "wagmi";
import { formatUnits, zeroAddress } from "viem";
import { Bell, ChevronRight, CircleDollarSign, ExternalLink, FileText, HandCoins, LayoutDashboard, Menu, Plus, ShieldCheck, Wallet, X } from "lucide-react";
import { NewInvoiceFlow, PublicPaymentFlow, useSellerInvoices } from "./InvoiceFlows";
import { erc20Abi, tokenSymbol } from "./contracts";
import { contractDeploymentBlock } from "./contracts";
import { contracts, whitechainSepolia } from "./network";

function WalletButton() { const { address, chain, isConnected } = useAccount(); const { connect, connectors } = useConnect(); const { disconnect } = useDisconnect(); const { switchChain } = useSwitchChain(); if (!isConnected) return <button className="button primary" onClick={() => connect({ connector: connectors[0] })}><Wallet size={16}/> Connect wallet</button>; if (chain?.id !== 1874) return <button className="button warn" onClick={() => switchChain({ chainId: 1874 })}>Switch to Whitechain</button>; return <button className="wallet" onClick={() => disconnect()}><span className="dot"/> {address?.slice(0, 6)}…{address?.slice(-4)}</button>; }
function Shell({ children }: { children: React.ReactNode }) { const [open, setOpen] = useState(false); const links = [["Overview", "/app", LayoutDashboard], ["Invoices", "/app/invoices", FileText], ["Financing", "/app/financing", HandCoins], ["Liquidity", "/app/liquidity", CircleDollarSign], ["Reputation", "/app/reputation", ShieldCheck]] as const; return <div className="shell"><aside className={open ? "sidebar active" : "sidebar"}><Link className="brand" to="/app"><span>W</span> WhiteSETTL</Link><p className="caption">OPERATING SYSTEM</p>{links.map(([label, to, Icon]) => <Link onClick={() => setOpen(false)} className="nav" to={to} key={to}><Icon size={18}/>{label}</Link>)}<div className="side-bottom"><a href="https://faucet.testnet.whitechain.io/" target="_blank">Get test WBT <ExternalLink size={14}/></a><p>Whitechain Sepolia<br/><b>WBT is used for gas</b></p></div></aside><main><header><button aria-label="Open menu" className="icon mobile" onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button><div className="network"><span className="dot"/> Whitechain Sepolia <span>•</span> WBT gas</div><div className="header-actions"><button className="icon"><Bell size={19}/></button><WalletButton/></div></header>{children}</main></div> }
function LiveDashboard() {
	const { chainId, isConnected } = useAccount();
	const invoiceQuery = useSellerInvoices();
	const decimals = useReadContract({ address: contracts.paymentToken ?? zeroAddress, abi: erc20Abi, functionName: "decimals", chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.paymentToken) } });
	const invoices = invoiceQuery.data ?? [];
	const total = invoices.reduce((sum, invoice) => sum + invoice.amount, 0n);
	const collected = invoices.filter(invoice => invoice.status === 6).reduce((sum, invoice) => sum + invoice.amount, 0n);
	const outstanding = total - collected;
	const format = (value: bigint) => decimals.data === undefined ? "—" : `${formatUnits(value, decimals.data)} ${tokenSymbol}`;
	const queryReady = Boolean(contracts.registry && contractDeploymentBlock !== undefined && chainId === whitechainSepolia.id);
	return <Shell><section className="page"><div className="hero"><div><p className="eyebrow">BUSINESS OVERVIEW</p><h1>Receivables,<br/><em>settled transparently.</em></h1><p className="sub">Invoice totals and statuses are read from Whitechain Sepolia.</p></div><Link className="button primary" to="/app/invoices/new"><Plus size={17}/> Create invoice</Link></div>
		{!contracts.registry && <p className="notice">Live invoice data is unavailable until verified contract addresses are configured.</p>}
		{contracts.registry && contractDeploymentBlock === undefined && <p className="notice">Set VITE_CONTRACT_DEPLOYMENT_BLOCK to the deployment block to load seller invoice events.</p>}
		{isConnected && chainId !== whitechainSepolia.id && <p className="notice">Switch the connected wallet to Whitechain Sepolia to view on-chain activity.</p>}
		<div className="metrics"><Metric label="Total invoiced" value={queryReady ? format(total) : "—"} delta={invoiceQuery.isLoading ? "Loading from Whitechain…" : "Confirmed registry events"}/><Metric label="Total collected" value={queryReady ? format(collected) : "—"} delta="Invoices in cleared state"/><Metric label="Outstanding" value={queryReady ? format(outstanding) : "—"} delta="Not yet cleared"/><Metric label="Invoices issued" value={queryReady ? String(invoices.length) : "—"} delta="Seller wallet activity"/></div>
		<section className="panel table-panel"><div className="panel-title"><div><p className="eyebrow">ON-CHAIN ACTIVITY</p><h2>Your invoices</h2></div><Link to="/app/invoices">View all <ChevronRight size={15}/></Link></div><InvoiceTable/></section>
	</section></Shell>;
}
function Dashboard() { return <LiveDashboard/>; }
function Metric({label,value,delta}:{label:string;value:string;delta:string}) { return <section className="metric"><p>{label}</p><strong>{value}</strong><small>{delta}</small></section> }
function InvoiceTable() {
	const { address, chainId, isConnected } = useAccount();
	const invoiceQuery = useSellerInvoices();
	const decimals = useReadContract({ address: contracts.paymentToken ?? zeroAddress, abi: erc20Abi, functionName: "decimals", chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.paymentToken) } });
	if (!isConnected || !address) return <div className="empty"><p>Connect a seller wallet to load invoices issued by that address.</p></div>;
	if (chainId !== whitechainSepolia.id) return <div className="empty"><p>Switch to Whitechain Sepolia to load on-chain invoices.</p></div>;
	if (!contracts.registry) return <div className="empty"><p>Invoice registry address is not configured.</p></div>;
	if (contractDeploymentBlock === undefined) return <div className="empty"><p>Configure VITE_CONTRACT_DEPLOYMENT_BLOCK to query this registry's invoice events.</p></div>;
	if (invoiceQuery.isLoading) return <div className="empty"><p>Loading invoices from Whitechain Sepolia…</p></div>;
	if (invoiceQuery.isError) return <div className="empty"><p>Could not load invoice events: {invoiceQuery.error.message}</p></div>;
	if (!invoiceQuery.data?.length) return <div className="empty"><p>No invoices issued by this wallet were found in the configured registry.</p></div>;
	const statusLabels = ["Draft", "Awaiting payment", "Financed", "Partially paid", "Paid", "Overdue", "Settled"];
	return <div className="table">{invoiceQuery.data.map(invoice => {
		const status = statusLabels[invoice.status] ?? "Unknown";
		const amount = decimals.data === undefined ? "—" : `${formatUnits(invoice.amount, decimals.data)} ${tokenSymbol}`;
		return <Link key={invoice.id.toString()} to={`/pay/${invoice.id}`}><span><b>WS-{invoice.id.toString()}</b><small>{invoice.buyer.slice(0, 6)}…{invoice.buyer.slice(-4)}</small></span><span>{amount}</span><span>{new Date(Number(invoice.dueDate) * 1000).toLocaleDateString()}</span><span className={`status ${status.replaceAll(" ", "-").toLowerCase()}`}>{status}</span><ChevronRight size={17}/></Link>;
	})}</div>;
}
function Invoices() { return <Shell><section className="page"><div className="section-head"><div><p className="eyebrow">RECEIVABLES</p><h1>Invoices</h1><p className="sub">Create payment links and manage every settlement in one place.</p></div><Link className="button primary" to="/app/invoices/new"><Plus size={17}/> New invoice</Link></div><div className="filters"><button className="active">All invoices</button><button>Open</button><button>Financed</button><button>Settled</button></div><section className="panel table-panel"><InvoiceTable/></section></section></Shell> }
function Finance() { return <Shell><section className="page"><p className="eyebrow">WORKING CAPITAL</p><h1>Invoice financing</h1><p className="sub">The financing contract is implemented and locally tested, but wallet actions are not enabled in this frontend yet.</p><section className="panel empty"><HandCoins size={28}/><h2>Financing UI unavailable</h2><p>No eligibility totals or offers are displayed until the financing workflow is connected to verified Sepolia contracts.</p></section><p className="legal">Advances are optional protocol financing, not a credit decision. The contract enforces the configured maximum LTV.</p></section></Shell> }
function Liquidity() { return <Shell><section className="page"><p className="eyebrow">LIQUIDITY</p><h1>Provide settlement liquidity</h1><p className="sub">The ERC-4626 vault is implemented and covered by local tests. Deposit and withdrawal controls are not connected in this frontend yet.</p><section className="panel empty"><CircleDollarSign size={28}/><h2>Liquidity position unavailable</h2><p>No token balance, share value, utilization, or yield is shown without a live vault connection.</p></section></section></Shell> }
function ReputationPage() { return <Shell><section className="page"><p className="eyebrow">TRANSPARENT HISTORY</p><h1>Business reputation</h1><section className="panel empty"><ShieldCheck size={28}/><h2>Reputation history is not connected</h2><p>Settlement updates are recorded by the protocol contract. This page will show the on-chain profile after the reputation read integration is complete.</p></section></section></Shell> }
function App() { return <Routes><Route path="/" element={<Navigate to="/app" replace/>}/><Route path="/app" element={<Dashboard/>}/><Route path="/app/invoices" element={<Invoices/>}/><Route path="/app/invoices/new" element={<Shell><NewInvoiceFlow/></Shell>}/><Route path="/app/financing" element={<Finance/>}/><Route path="/app/liquidity" element={<Liquidity/>}/><Route path="/app/reputation" element={<ReputationPage/>}/><Route path="/pay/:invoiceId" element={<PublicPaymentFlow/>}/><Route path="*" element={<Navigate to="/app" replace/>}/></Routes> } export default App;
