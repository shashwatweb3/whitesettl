import { useEffect, useRef, useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { formatUnits, isAddressEqual, parseUnits, zeroAddress, type Hash } from "viem";
import { Check, ExternalLink, HandCoins } from "lucide-react";
import { useSellerInvoices, type SellerInvoice } from "./InvoiceFlows";
import { advanceEngineAbi, erc20Abi, reputationAbi, tokenSymbol, vaultAbi } from "./contracts";
import { contracts, explorerTx, whitechainSepolia } from "./network";
import "./protocol-flows.css";

function formatAmount(value: bigint | undefined, decimals: number | undefined) {
  return value === undefined || decimals === undefined ? "—" : `${formatUnits(value, decimals)} ${tokenSymbol}`;
}

function InvoiceAdvanceRow({ invoice, decimals }: { invoice: SellerInvoice; decimals: number | undefined }) {
  const { address, chainId } = useAccount();
  const [ltvBps, setLtvBps] = useState(7000);
  const [hash, setHash] = useState<Hash>();
  const [error, setError] = useState("");
  const handledHash = useRef<Hash>();
  const { writeContractAsync, isPending } = useWriteContract();
  const advance = useReadContract({
    address: contracts.advanceEngine ?? zeroAddress,
    abi: advanceEngineAbi,
    functionName: "advances",
    args: [invoice.id],
    chainId: whitechainSepolia.id,
    query: { enabled: Boolean(contracts.advanceEngine) },
  });
  const receipt = useWaitForTransactionReceipt({ hash, chainId: whitechainSepolia.id });
  const position = advance.data;
  const eligible = invoice.status === 1 && isAddressEqual(invoice.seller, address ?? zeroAddress);

  useEffect(() => {
    if (!receipt.isSuccess || receipt.data?.status !== "success" || !hash || handledHash.current === hash) return;
    handledHash.current = hash;
    void advance.refetch();
  }, [advance.refetch, hash, receipt.data?.status, receipt.isSuccess]);

  async function request() {
    if (!contracts.advanceEngine || !address || chainId !== whitechainSepolia.id || !eligible) return;
    setError("");
    try {
      const txHash = await writeContractAsync({
        address: contracts.advanceEngine,
        abi: advanceEngineAbi,
        functionName: "requestAdvance",
        args: [invoice.id, ltvBps],
        chainId: whitechainSepolia.id,
      });
      setHash(txHash);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Advance request failed.");
    }
  }

  return <article className="table-row">
    <div><b>WS-{invoice.id.toString()}</b><small>{formatAmount(invoice.amount, decimals)} · due {new Date(Number(invoice.dueDate) * 1000).toLocaleDateString()}</small></div>
    {position?.[2] ? <div><b>Active advance</b><small>Principal {formatAmount(position[0], decimals)} · repayment {formatAmount(position[1], decimals)}</small></div>
      : eligible ? <div className="advance-actions"><label>LTV<select value={ltvBps} onChange={event => setLtvBps(Number(event.target.value))}><option value={5000}>50%</option><option value={6000}>60%</option><option value={7000}>70%</option><option value={8000}>80%</option></select></label><button className="button primary" disabled={!contracts.advanceEngine || chainId !== whitechainSepolia.id || isPending || receipt.isLoading} onClick={request}>{isPending ? "Confirm in wallet…" : receipt.isLoading ? "Confirming…" : "Request advance"}</button></div>
        : <span className="status">Not eligible</span>}
    {hash && <a href={explorerTx(hash)} target="_blank" rel="noreferrer" aria-label="View advance transaction on explorer"><ExternalLink size={16}/></a>}
    {receipt.isSuccess && receipt.data?.status === "success" && <Check size={17} aria-label="Advance confirmed"/>}
    {error && <small className="error" role="alert">{error}</small>}
    {receipt.isError && <small className="error" role="alert">{receipt.error.message}</small>}
    {receipt.isSuccess && receipt.data?.status === "reverted" && <small className="error" role="alert">Advance transaction reverted.</small>}
  </article>;
}

export function FinancingPage() {
  const { address, chainId, isConnected } = useAccount();
  const invoices = useSellerInvoices();
  const decimalsRead = useReadContract({ address: contracts.paymentToken ?? zeroAddress, abi: erc20Abi, functionName: "decimals", chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.paymentToken) } });
  const positions = (invoices.data ?? []).filter(invoice => invoice.status === 1 || invoice.status === 2);
  return <section className="page">
    <p className="eyebrow">WORKING CAPITAL</p><h1>Invoice financing</h1>
    <p className="sub">Request an advance against an issued invoice. Principal and repayment are read from the protocol after confirmation.</p>
    {!isConnected && <p className="notice">Connect the seller wallet to view eligible invoices.</p>}
    {isConnected && chainId !== whitechainSepolia.id && <p className="notice">Switch to Whitechain Sepolia to request an advance.</p>}
    {!contracts.advanceEngine && <p className="notice">AdvanceEngine address is not configured.</p>}
    {invoices.isError && <p className="error" role="alert">Unable to load invoices: {invoices.error.message}</p>}
    {invoices.isLoading && <p className="notice">Loading invoices from Whitechain Sepolia…</p>}
    {invoices.data && positions.length === 0 && <section className="panel empty"><HandCoins size={28}/><h2>No eligible invoice positions</h2><p>Issued, unpaid invoices for this seller will appear here.</p></section>}
    {positions.length > 0 && <section className="panel table-panel"><div className="panel-title"><h2>Invoice positions</h2><span className="notice">Maximum LTV 80%</span></div>{positions.map(invoice => <InvoiceAdvanceRow key={invoice.id.toString()} invoice={invoice} decimals={decimalsRead.data}/>)}</section>}
    {address && contracts.advanceEngine && <p className="legal">Financing requests are submitted by the connected invoice seller. Advances are not guaranteed and may fail if vault cash is insufficient.</p>}
  </section>;
}

export function LiquidityPage() {
  const { address, chainId, isConnected } = useAccount();
  const [amount, setAmount] = useState("");
  const [hash, setHash] = useState<Hash>();
  const [approvalHash, setApprovalHash] = useState<Hash>();
  const [kind, setKind] = useState<"approve" | "deposit" | "withdraw">();
  const handledHash = useRef<Hash>();
  const [error, setError] = useState("");
  const { writeContractAsync, isPending } = useWriteContract();
  const decimalsRead = useReadContract({ address: contracts.paymentToken ?? zeroAddress, abi: erc20Abi, functionName: "decimals", chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.paymentToken) } });
  const tokenBalance = useReadContract({ address: contracts.paymentToken ?? zeroAddress, abi: erc20Abi, functionName: "balanceOf", args: [address ?? zeroAddress], chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.paymentToken && address) } });
  const allowance = useReadContract({ address: contracts.paymentToken ?? zeroAddress, abi: erc20Abi, functionName: "allowance", args: [address ?? zeroAddress, contracts.vault ?? zeroAddress], chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.paymentToken && contracts.vault && address) } });
  const shares = useReadContract({ address: contracts.vault ?? zeroAddress, abi: vaultAbi, functionName: "balanceOf", args: [address ?? zeroAddress], chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.vault && address) } });
  const totalAssets = useReadContract({ address: contracts.vault ?? zeroAddress, abi: vaultAbi, functionName: "totalAssets", chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.vault) } });
  const idleCash = useReadContract({ address: contracts.paymentToken ?? zeroAddress, abi: erc20Abi, functionName: "balanceOf", args: [contracts.vault ?? zeroAddress], chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.paymentToken && contracts.vault) } });
  const outstandingLoans = useReadContract({ address: contracts.vault ?? zeroAddress, abi: vaultAbi, functionName: "outstandingLoans", chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.vault) } });
  const vaultAsset = useReadContract({ address: contracts.vault ?? zeroAddress, abi: vaultAbi, functionName: "asset", chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.vault) } });
  const maxWithdraw = useReadContract({ address: contracts.vault ?? zeroAddress, abi: vaultAbi, functionName: "maxWithdraw", args: [address ?? zeroAddress], chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.vault && address) } });
  const receipt = useWaitForTransactionReceipt({ hash, chainId: whitechainSepolia.id });
  const parsedAmount = amount && decimalsRead.data !== undefined ? (() => { try { return parseUnits(amount, decimalsRead.data); } catch { return 0n; } })() : 0n;
  const amountValid = parsedAmount > 0n && decimalsRead.data !== undefined;
  const needsApproval = parsedAmount > (allowance.data ?? 0n);
  const assetMatches = Boolean(contracts.paymentToken && vaultAsset.data && isAddressEqual(contracts.paymentToken, vaultAsset.data));
  const contractReady = Boolean(contracts.vault && contracts.paymentToken && assetMatches);

  useEffect(() => {
    if (!receipt.isSuccess || receipt.data?.status !== "success" || !hash || handledHash.current === hash) return;
    handledHash.current = hash;
    void (async () => {
      await Promise.all([tokenBalance.refetch(), allowance.refetch(), shares.refetch(), totalAssets.refetch(), idleCash.refetch(), outstandingLoans.refetch(), maxWithdraw.refetch()]);
      if (kind === "approve") {
        setApprovalHash(hash);
        setHash(undefined);
        setKind(undefined);
      }
    })();
  }, [allowance, hash, idleCash, kind, maxWithdraw, outstandingLoans, receipt.data?.status, receipt.isSuccess, shares, tokenBalance, totalAssets]);

  async function transact(requested: "approve" | "deposit" | "withdraw") {
    if (!contractReady || !address || chainId !== whitechainSepolia.id || !amountValid) return;
    setError("");
    const operation = requested === "deposit" && needsApproval ? "approve" : requested;
    setKind(operation);
    try {
      const txHash = operation === "approve"
        ? await writeContractAsync({ address: contracts.paymentToken!, abi: erc20Abi, functionName: "approve", args: [contracts.vault!, parsedAmount], chainId: whitechainSepolia.id })
        : operation === "deposit"
          ? await writeContractAsync({ address: contracts.vault!, abi: vaultAbi, functionName: "deposit", args: [parsedAmount, address], chainId: whitechainSepolia.id })
          : await writeContractAsync({ address: contracts.vault!, abi: vaultAbi, functionName: "withdraw", args: [parsedAmount, address, address], chainId: whitechainSepolia.id });
      setHash(txHash);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Vault transaction failed.");
    }
  }

  return <section className="page">
    <p className="eyebrow">LIQUIDITY</p><h1>Provide settlement liquidity</h1><p className="sub">Deposit payment tokens for ERC-4626 shares. Withdrawals are capped by current idle vault cash.</p>
    {!isConnected && <p className="notice">Connect a liquidity provider wallet to view balances.</p>}
    {!contractReady && <p className="notice">Vault and payment-token addresses must be configured.</p>}
    {contracts.vault && contracts.paymentToken && vaultAsset.data && !assetMatches && <p className="error" role="alert">Configured vault asset does not match the payment token. Vault actions are disabled.</p>}
    {chainId !== undefined && chainId !== whitechainSepolia.id && <p className="notice">Switch to Whitechain Sepolia before submitting a vault transaction.</p>}
    <div className="metrics"><Metric label="Wallet token balance" value={formatAmount(tokenBalance.data, decimalsRead.data)} delta="Read from payment token"/><Metric label="Vault shares" value={formatAmount(shares.data, decimalsRead.data)} delta="ERC-4626 balance"/><Metric label="Vault total assets" value={formatAmount(totalAssets.data, decimalsRead.data)} delta="Idle cash plus outstanding principal"/><Metric label="Idle vault cash" value={formatAmount(idleCash.data, decimalsRead.data)} delta="Available for withdrawal/advance"/><Metric label="Outstanding principal" value={formatAmount(outstandingLoans.data, decimalsRead.data)} delta="Currently financed"/><Metric label="Your max withdrawal" value={formatAmount(maxWithdraw.data, decimalsRead.data)} delta="Limited to idle liquidity"/></div>
    {contractReady && isConnected && <section className="panel form">
      <label>Amount ({tokenSymbol})<input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00"/></label>
      <div className="two">
        <button className="button primary" disabled={!amountValid || !address || chainId !== whitechainSepolia.id || isPending || receipt.isLoading || needsApproval} onClick={() => void transact("deposit")}>{isPending ? "Confirm in wallet…" : receipt.isLoading && kind === "deposit" ? "Confirming…" : "Deposit"}</button>
        <button className="button" disabled={!amountValid || !address || chainId !== whitechainSepolia.id || isPending || receipt.isLoading || parsedAmount > (maxWithdraw.data ?? 0n)} onClick={() => void transact("withdraw")}>{isPending ? "Confirm in wallet…" : receipt.isLoading && kind === "withdraw" ? "Confirming…" : "Withdraw"}</button>
      </div>
      {needsApproval && <button className="button" disabled={!amountValid || chainId !== whitechainSepolia.id || isPending || receipt.isLoading} onClick={() => void transact("approve")}>{isPending ? "Confirm in wallet…" : "Approve token deposit"}</button>}
      {error && <p className="error" role="alert">{error}</p>}
      {receipt.isError && <p className="error" role="alert">Transaction failed: {receipt.error.message}</p>}
      {receipt.data?.status === "reverted" && <p className="error" role="alert">Vault transaction reverted.</p>}
      {approvalHash && <p className="notice">Token approval confirmed. <a href={explorerTx(approvalHash)} target="_blank" rel="noreferrer">View approval on Explorer</a></p>}
      {receipt.isSuccess && receipt.data?.status === "success" && hash && <p className="notice">Vault operation confirmed. <a href={explorerTx(hash)} target="_blank" rel="noreferrer">View on Explorer</a></p>}
    </section>}
  </section>;
}

function Metric({ label, value, delta }: { label: string; value: string; delta: string }) {
  return <section className="metric"><p>{label}</p><strong>{value}</strong><small>{delta}</small></section>;
}

export function ReputationPage() {
  const { address, chainId, isConnected } = useAccount();
  const profile = useReadContract({ address: contracts.reputation ?? zeroAddress, abi: reputationAbi, functionName: "profiles", args: [address ?? zeroAddress], chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.reputation && address && chainId === whitechainSepolia.id) } });
  const tier = useReadContract({ address: contracts.reputation ?? zeroAddress, abi: reputationAbi, functionName: "tier", args: [address ?? zeroAddress], chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.reputation && address && chainId === whitechainSepolia.id) } });
  const decimals = useReadContract({ address: contracts.paymentToken ?? zeroAddress, abi: erc20Abi, functionName: "decimals", chainId: whitechainSepolia.id, query: { enabled: Boolean(contracts.paymentToken) } });
  const data = profile.data;
  const paidInvoices = data?.[0];
  const latePayments = data?.[1];
  const settledVolume = data?.[2];
  const outstandingFinanced = data?.[3];
  const tierLabel = tier.data === 3 ? "Premier" : tier.data === 2 ? "Established" : tier.data === 1 ? "Building" : "—";
  return <section className="page"><p className="eyebrow">TRANSPARENT HISTORY</p><h1>Business reputation</h1>
    {!isConnected && <p className="notice">Connect a business wallet to load its on-chain reputation profile.</p>}
    {isConnected && chainId !== whitechainSepolia.id && <p className="notice">Switch to Whitechain Sepolia to read reputation.</p>}
    {!contracts.reputation && <p className="notice">Reputation contract address is not configured.</p>}
    {profile.isError && <p className="error" role="alert">Unable to read profile: {profile.error.message}</p>}
    <div className="reputation-page"><section className="panel"><p className="eyebrow">ON-CHAIN PROFILE</p><div className="big-score">{data ? tierLabel : "—"}</div><p className="tier">{data ? `${paidInvoices?.toString()} settled invoices` : "No connected profile"}</p><p className="muted">The protocol records settlement history and open financed principal. It does not assess real-world creditworthiness.</p></section><section className="panel factors"><h2>Profile data</h2><div><span>Settled invoices</span><b>{paidInvoices?.toString() ?? "—"}</b></div><div><span>Late settlements</span><b>{latePayments?.toString() ?? "—"}</b></div><div><span>Settled volume</span><b>{formatAmount(settledVolume, decimals.data)}</b></div><div><span>Outstanding financed principal</span><b>{formatAmount(outstandingFinanced, decimals.data)}</b></div><div><span>Tier</span><b>{tierLabel}</b></div></section></div>
  </section>;
}
