import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useConnect, usePublicClient, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { formatUnits, getAddress, isAddress, isAddressEqual, keccak256, parseEventLogs, parseUnits, toBytes, zeroAddress, type Address, type Hash } from "viem";
import { Check, Copy, ExternalLink, ShieldCheck, Wallet } from "lucide-react";
import { contractDeploymentBlock, erc20Abi, expectedTokenDecimals, invalidTokenDecimalsConfig, invoiceIssuedEvent, registryAbi, routerAbi, tokenSymbol } from "./contracts";
import { contracts, explorerTx, whitechainSepolia } from "./network";

const registryConfigured = Boolean(contracts.registry && contracts.paymentToken);
const paymentConfigured = Boolean(registryConfigured && contracts.router);

export type SellerInvoice = {
  id: bigint;
  seller: Address;
  buyer: Address;
  asset: Address;
  amount: bigint;
  issueDate: bigint;
  dueDate: bigint;
  status: number;
  metadataHash: Hash;
};

export function useSellerInvoices() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: whitechainSepolia.id });
  return useQuery({
    queryKey: ["seller-invoices", contracts.registry, address, contractDeploymentBlock?.toString(), chainId],
    enabled: Boolean(address && chainId === whitechainSepolia.id && publicClient && contracts.registry && contractDeploymentBlock !== undefined),
    refetchInterval: 12_000,
    queryFn: async (): Promise<SellerInvoice[]> => {
      if (!address || !publicClient || !contracts.registry || contractDeploymentBlock === undefined) return [];
      const recentLogs = [];
      let endBlock = await publicClient.getBlockNumber();
      while (endBlock >= contractDeploymentBlock && recentLogs.length < 100) {
        const startBlock = endBlock - contractDeploymentBlock > 1_999n ? endBlock - 1_999n : contractDeploymentBlock;
        const blockLogs = await publicClient.getLogs({
          address: contracts.registry,
          event: invoiceIssuedEvent,
          args: { seller: address },
          fromBlock: startBlock,
          toBlock: endBlock,
        });
        recentLogs.push(...blockLogs.reverse());
        if (startBlock === 0n) break;
        endBlock = startBlock - 1n;
      }
      return Promise.all(recentLogs.slice(0, 100).map(async (log) => {
        const id = log.args.invoiceId;
        if (id === undefined) throw new Error("InvoiceIssued event did not include an invoice ID.");
        const invoice = await publicClient.readContract({ address: contracts.registry!, abi: registryAbi, functionName: "getInvoice", args: [id] });
        return { id, ...invoice };
      }));
    },
  });
}

function errorText(error: Error | null | undefined) {
  return error?.message || "The wallet request failed. Check the network and try again.";
}

function NetworkAction() {
  const { isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChain } = useSwitchChain();
  if (!isConnected) return <button className="button primary" onClick={() => connect({ connector: connectors[0] })}><Wallet size={16}/> Connect wallet</button>;
  if (chainId !== whitechainSepolia.id) return <button className="button warn" onClick={() => switchChain({ chainId: whitechainSepolia.id })}>Switch to Whitechain Sepolia</button>;
  return <span className="notice">Connected to Whitechain Sepolia</span>;
}

export function NewInvoiceFlow() {
  const { address, chainId, isConnected } = useAccount();
  const { writeContractAsync, isPending, error: writeError } = useWriteContract();
  const [buyer, setBuyer] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [txHash, setTxHash] = useState<Hash>();
  const [invoiceLink, setInvoiceLink] = useState("");
  const [eventMissing, setEventMissing] = useState(false);
  const [actionError, setActionError] = useState("");
  const receipt = useWaitForTransactionReceipt({ hash: txHash, chainId: whitechainSepolia.id });
  const decimalsRead = useReadContract({
    address: contracts.paymentToken ?? zeroAddress,
    abi: erc20Abi,
    functionName: "decimals",
    chainId: whitechainSepolia.id,
    query: { enabled: Boolean(contracts.paymentToken) },
  });
  const assetRead = useReadContract({
    address: contracts.registry ?? zeroAddress,
    abi: registryAbi,
    functionName: "paymentAsset",
    chainId: whitechainSepolia.id,
    query: { enabled: Boolean(contracts.registry) },
  });
  const validBuyer = isAddress(buyer);
  const decimals = decimalsRead.data;
  const tokenMatches = Boolean(contracts.paymentToken && assetRead.data && isAddressEqual(contracts.paymentToken, assetRead.data));
  const decimalsMatch = decimals !== undefined && decimals <= 36 && !invalidTokenDecimalsConfig && (expectedTokenDecimals === undefined || decimals === expectedTokenDecimals);
  const canIssue = Boolean(isConnected && address && chainId === whitechainSepolia.id && registryConfigured && validBuyer && amount && dueDate && description.trim() && tokenMatches && decimalsMatch && !isPending && !receipt.isLoading);

  useEffect(() => {
    if (!receipt.isSuccess || !receipt.data || !txHash) return;
    if (receipt.data.status !== "success") {
      setActionError("Invoice transaction was reverted on Whitechain. No payment link was created.");
      return;
    }
    try {
      const registryLogs = receipt.data.logs.filter(log => contracts.registry && isAddressEqual(log.address, contracts.registry));
      const events = parseEventLogs({ abi: registryAbi, eventName: "InvoiceIssued", logs: registryLogs });
      const issued = events.find(event => address && validBuyer && isAddressEqual(event.args.seller, address) && isAddressEqual(event.args.buyer, getAddress(buyer)) && contracts.paymentToken && isAddressEqual(event.args.asset, contracts.paymentToken));
      const invoiceId = issued?.args.invoiceId;
      if (invoiceId === undefined) {
        setEventMissing(true);
        return;
      }
      setInvoiceLink(`${window.location.origin}/pay/${invoiceId}`);
    } catch {
      setEventMissing(true);
    }
  }, [receipt.data, receipt.isSuccess, txHash]);

  async function submitInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setInvoiceLink("");
    setEventMissing(false);
    if (!contracts.registry || !contracts.paymentToken || decimals === undefined || !validBuyer || !address) return;
    try {
      const invoiceAmount = parseUnits(amount, decimals);
      if (invoiceAmount <= 0n || invoiceAmount >= 1n << 128n) throw new Error("Amount must fit the invoice contract's uint128 limit.");
      const dueTimestamp = BigInt(Math.floor(new Date(`${dueDate}T23:59:59`).getTime() / 1000));
      if (dueTimestamp <= BigInt(Math.floor(Date.now() / 1000))) throw new Error("Choose a due date in the future.");
      const hash = await writeContractAsync({
        address: contracts.registry,
        abi: registryAbi,
        functionName: "issueInvoice",
        args: [getAddress(buyer), contracts.paymentToken, invoiceAmount, dueTimestamp, keccak256(toBytes(`${crypto.randomUUID()}:${Date.now()}`)), keccak256(toBytes(description.trim()))],
        chainId: whitechainSepolia.id,
      });
      setTxHash(hash);
    } catch (error) {
      setActionError(errorText(error instanceof Error ? error : null));
    }
  }

  async function copyInvoiceLink() {
    await navigator.clipboard.writeText(invoiceLink);
  }

  const mismatch = expectedTokenDecimals !== undefined && decimals !== undefined && expectedTokenDecimals !== decimals;
  return <section className="page narrow">
    <div className="section-head"><div><p className="eyebrow">NEW RECEIVABLE</p><h1>Create invoice</h1><p className="sub">Issue an invoice on Whitechain and share its payment link after the transaction confirms.</p></div><NetworkAction/></div>
    {!registryConfigured && <p className="notice">Invoice issuance is disabled until verified Sepolia registry and payment-token addresses are set in the local environment.</p>}
    {invalidTokenDecimalsConfig && <p className="error">VITE_PAYMENT_TOKEN_DECIMALS must be an integer from 0 to 36.</p>}
    {mismatch && <p className="error">Configured token decimals ({expectedTokenDecimals}) do not match the token contract ({decimals}). Correct the local configuration before issuing invoices.</p>}
    {assetRead.isError && <p className="error">Could not verify the registry's configured payment asset: {errorText(assetRead.error)}</p>}
    {decimalsRead.isError && <p className="error">Could not read payment-token decimals: {errorText(decimalsRead.error)}</p>}
    {invoiceLink ? <div className="success"><Check size={28}/><h2>Invoice confirmed</h2><p>The registry transaction is confirmed on Whitechain Sepolia. Share this customer payment link:</p><a href={invoiceLink}>{invoiceLink}</a><div className="header-actions"><button className="button primary" onClick={copyInvoiceLink}><Copy size={16}/> Copy link</button>{txHash && <a className="button" href={explorerTx(txHash)} target="_blank" rel="noreferrer">View transaction <ExternalLink size={15}/></a>}</div></div> : <form className="form" onSubmit={submitInvoice}>
      <label>Customer wallet address<input value={buyer} onChange={event => setBuyer(event.target.value)} placeholder="0x…" required/><small className={buyer && !validBuyer ? "error" : ""}>{buyer && !validBuyer ? "Enter a valid EVM address" : "Only this wallet can pay the invoice."}</small></label>
      <div className="two"><label>Invoice amount ({tokenSymbol})<input value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" inputMode="decimal" required/></label><label>Payment asset<input value={contracts.paymentToken ?? "Not configured"} readOnly aria-label="Configured payment token"/></label></div>
      <label>Description<input value={description} onChange={event => setDescription(event.target.value)} placeholder="Design services — November retainer" required/></label>
      <label>Due date<input value={dueDate} onChange={event => setDueDate(event.target.value)} type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} required/></label>
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {writeError && <p className="error" role="alert">{errorText(writeError)}</p>}
      {txHash && <p className="notice">Transaction submitted. Waiting for Whitechain confirmation… <a href={explorerTx(txHash)} target="_blank" rel="noreferrer">View on Explorer</a></p>}
      {receipt.isError && <p className="error" role="alert">Invoice transaction failed: {errorText(receipt.error)}</p>}
      {eventMissing && <p className="error" role="alert">The transaction confirmed, but no InvoiceIssued event was found. Check the transaction on Explorer; no payment link was fabricated.</p>}
      <button disabled={!canIssue} className="button primary" type="submit">{isPending ? "Confirm in wallet…" : receipt.isLoading ? "Confirming on Whitechain…" : "Issue invoice"}<ShieldCheck size={16}/></button>
    </form>}
  </section>;
}

export function PublicPaymentFlow() {
  const { invoiceId = "" } = useParams();
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: whitechainSepolia.id });
  const { writeContractAsync, isPending, error: writeError } = useWriteContract();
  const [txHash, setTxHash] = useState<Hash>();
  const [txKind, setTxKind] = useState<"approve" | "pay">();
  const [paidHash, setPaidHash] = useState<Hash>();
  const [settlementResult, setSettlementResult] = useState<{ fee: bigint; repayment: bigint; sellerProceeds: bigint }>();
  const [actionError, setActionError] = useState("");
  const handledHash = useRef<Hash>();
  const validId = /^\d+$/.test(invoiceId) && BigInt(invoiceId || "0") > 0n;
  const id = validId ? BigInt(invoiceId) : 0n;
  const invoiceRead = useReadContract({
    address: contracts.registry ?? zeroAddress,
    abi: registryAbi,
    functionName: "getInvoice",
    args: [id],
    chainId: whitechainSepolia.id,
    query: { enabled: Boolean(contracts.registry && validId) },
  });
  const decimalsRead = useReadContract({
    address: contracts.paymentToken ?? zeroAddress,
    abi: erc20Abi,
    functionName: "decimals",
    chainId: whitechainSepolia.id,
    query: { enabled: Boolean(contracts.paymentToken) },
  });
  const customerBalance = useReadContract({
    address: contracts.paymentToken ?? zeroAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: whitechainSepolia.id,
    query: { enabled: Boolean(contracts.paymentToken && address) },
  });
  const feeBpsRead = useReadContract({
    address: contracts.router ?? zeroAddress,
    abi: routerAbi,
    functionName: "feeBps",
    chainId: whitechainSepolia.id,
    query: { enabled: Boolean(contracts.router) },
  });
  const amount = invoiceRead.data?.amount;
  const buyer = invoiceRead.data?.buyer;
  const invoiceAsset = invoiceRead.data?.asset;
  const invoiceStatus = invoiceRead.data?.status;
  const invoiceExists = Boolean(invoiceRead.data && invoiceRead.data.seller !== zeroAddress && amount !== undefined);
  const isBuyer = Boolean(address && buyer && isAddressEqual(address, buyer));
  const tokenMatches = Boolean(contracts.paymentToken && invoiceAsset && isAddressEqual(contracts.paymentToken, invoiceAsset));
  const canReadAllowance = Boolean(address && contracts.paymentToken && contracts.router && amount !== undefined && isBuyer);
  const allowanceRead = useReadContract({
    address: contracts.paymentToken ?? zeroAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? zeroAddress, contracts.router ?? zeroAddress],
    chainId: whitechainSepolia.id,
    query: { enabled: canReadAllowance },
  });
  const receipt = useWaitForTransactionReceipt({ hash: txHash, chainId: whitechainSepolia.id });
  const allowedAmount = allowanceRead.data ?? 0n;
  const needsApproval = amount !== undefined && allowedAmount < amount;
  const payableStatus = invoiceStatus === 1 || invoiceStatus === 2;

  useEffect(() => {
    if (!receipt.isSuccess || !txHash || handledHash.current === txHash) return;
    handledHash.current = txHash;
    if (receipt.data?.status !== "success") {
      setActionError(`${txKind === "approve" ? "Token approval" : "Payment"} transaction reverted on Whitechain.`);
      setTxHash(undefined);
      setTxKind(undefined);
      return;
    }
    if (txKind === "approve") {
      void allowanceRead.refetch().finally(() => {
        setTxHash(undefined);
        setTxKind(undefined);
      });
    } else if (txKind === "pay") {
      void (async () => {
        if (!publicClient || !contracts.router || !contracts.registry || !contracts.paymentToken || !buyer || !amount || feeBpsRead.data === undefined) {
          throw new Error("Cannot verify the settlement event and invoice state from the configured contracts.");
        }
        const routerLogs = receipt.data!.logs.filter(log => isAddressEqual(log.address, contracts.router!));
        const events = parseEventLogs({ abi: routerAbi, eventName: "InvoiceSettled", logs: routerLogs });
        const settled = events.find(event => event.args.invoiceId === id && isAddressEqual(event.args.buyer, buyer));
        if (!settled) throw new Error("Successful receipt did not contain the matching InvoiceSettled event.");
        const expectedFee = amount * BigInt(feeBpsRead.data) / 10_000n;
        const expectedSellerProceeds = amount - expectedFee - settled.args.repayment;
        if (settled.args.fee !== expectedFee || settled.args.sellerProceeds !== expectedSellerProceeds) {
          throw new Error("Settlement event fee or seller proceeds do not match the invoice and configured fee.");
        }
        const settledInvoice = await publicClient.readContract({
          address: contracts.registry,
          abi: registryAbi,
          functionName: "getInvoice",
          args: [id],
          blockNumber: receipt.data!.blockNumber,
        });
        if (settledInvoice.status !== 6) throw new Error("Settlement event was emitted, but the invoice is not cleared at the receipt block.");
        setSettlementResult({ fee: settled.args.fee, repayment: settled.args.repayment, sellerProceeds: settled.args.sellerProceeds });
        setPaidHash(txHash);
        await Promise.all([customerBalance.refetch(), invoiceRead.refetch(), allowanceRead.refetch()]);
        setTxHash(undefined);
        setTxKind(undefined);
      })().catch(error => {
        setActionError(errorText(error instanceof Error ? error : null));
        setTxHash(undefined);
        setTxKind(undefined);
      });
    }
  }, [address, allowanceRead, amount, buyer, customerBalance, feeBpsRead.data, id, invoiceRead, publicClient, receipt.data, receipt.isSuccess, txHash, txKind]);

  useEffect(() => {
    document.title = `Invoice ${invoiceId || "not found"} — WhiteSETTL`;
  }, [invoiceId]);

  async function approveOrPay() {
    if (!contracts.paymentToken || !contracts.router || !amount) return;
    setActionError("");
    const kind = needsApproval ? "approve" : "pay";
    setTxKind(kind);
    try {
      const hash = kind === "approve"
        ? await writeContractAsync({ address: contracts.paymentToken, abi: erc20Abi, functionName: "approve", args: [contracts.router, amount], chainId: whitechainSepolia.id })
        : await writeContractAsync({ address: contracts.router, abi: routerAbi, functionName: "pay", args: [id], chainId: whitechainSepolia.id });
      setTxHash(hash);
    } catch (error) {
      setTxKind(undefined);
      setActionError(errorText(error instanceof Error ? error : null));
    }
  }

  const decimals = decimalsRead.data;
  const decimalsMatch = decimals !== undefined && decimals <= 36 && !invalidTokenDecimalsConfig && (expectedTokenDecimals === undefined || decimals === expectedTokenDecimals);
  const canPay = Boolean(paymentConfigured && invoiceExists && isConnected && chainId === whitechainSepolia.id && isBuyer && tokenMatches && payableStatus && decimalsMatch && !isPending && !receipt.isLoading && !paidHash);
  const formattedAmount = amount !== undefined && decimals !== undefined ? `${formatUnits(amount, decimals)} ${tokenSymbol}` : "—";
  const dueDate = invoiceRead.data?.dueDate ? new Date(Number(invoiceRead.data.dueDate) * 1000).toLocaleDateString() : "—";

  return <div className="pay-page"><nav><Link className="brand" to="/app"><span>W</span> WhiteSETTL</Link><div className="network"><span className="dot"/> Whitechain Sepolia</div></nav>
    <section className="invoice-card">
      <div className="issuer"><div className="avatar">W</div><div><small>ON-CHAIN INVOICE</small><b>Invoice #{invoiceId || "?"}</b></div></div>
      {!validId && <p className="error" role="alert">This is not a valid invoice link.</p>}
      {validId && !contracts.registry && <p className="notice">Public invoice details are unavailable until a verified Sepolia registry address is configured.</p>}
      {invalidTokenDecimalsConfig && <p className="error" role="alert">VITE_PAYMENT_TOKEN_DECIMALS must be an integer from 0 to 36. Payment is blocked.</p>}
      {invoiceRead.isLoading && <p className="notice">Loading invoice from Whitechain Sepolia…</p>}
      {invoiceRead.isError && <p className="error" role="alert">Unable to read invoice: {errorText(invoiceRead.error)}</p>}
      {validId && invoiceRead.data && !invoiceExists && <p className="error" role="alert">Invoice #{invoiceId} does not exist in the configured registry.</p>}
      {invoiceExists && <>
        <div className="invoice-amount"><p>Invoice #{invoiceId}</p><h1>{formattedAmount}</h1><span>Due {dueDate}</span></div>
        <div className="invoice-detail"><span>Seller</span><b>{invoiceRead.data?.seller}</b><span>Customer</span><b>{buyer}</b><span>Payment asset</span><b>{tokenMatches ? tokenSymbol : "Asset configuration mismatch"}</b><span>Status</span><b>{invoiceStatus === 1 ? "Awaiting payment" : invoiceStatus === 2 ? "Financed · payable" : "Not payable"}</b></div>
        {!tokenMatches && <p className="error" role="alert">This invoice asset does not match the configured payment token; payment is blocked.</p>}
        {expectedTokenDecimals !== undefined && decimals !== undefined && expectedTokenDecimals !== decimals && <p className="error" role="alert">Configured token decimals do not match the token contract. Payment is blocked to prevent incorrect amounts.</p>}
        {decimalsRead.isError && <p className="error" role="alert">Could not verify token decimals: {errorText(decimalsRead.error)}</p>}
        {invoiceStatus !== undefined && !payableStatus && <p className="notice">This invoice is not in a payable state.</p>}
        <div className="payment-note"><ShieldCheck size={17}/><span>Payment and confirmation are read from Whitechain Sepolia. WBT is used only for gas.</span></div>
        {address && customerBalance.data !== undefined && decimals !== undefined && <p className="notice">Connected wallet balance: {formatUnits(customerBalance.data, decimals)} {tokenSymbol}</p>}
        {!isConnected ? <button className="button primary wide" onClick={() => connect({ connector: connectors[0] })}><Wallet size={17}/> Connect buyer wallet</button>
          : chainId !== whitechainSepolia.id ? <button className="button warn wide" onClick={() => switchChain({ chainId: whitechainSepolia.id })}>Switch to Whitechain Sepolia</button>
          : !isBuyer ? <p className="notice">Connect the customer wallet authorized on this invoice to pay.</p>
          : <button disabled={!canPay} className="button primary wide" onClick={approveOrPay}>{isPending ? "Confirm in wallet…" : receipt.isLoading ? `Confirming ${txKind}…` : needsApproval ? `Approve ${tokenSymbol}` : `Pay ${formattedAmount}`}</button>}
        {writeError && <p className="error" role="alert">{errorText(writeError)}</p>}
        {actionError && <p className="error" role="alert">{actionError}</p>}
        {txHash && <p className="notice">{txKind === "approve" ? "Approval" : "Payment"} submitted, waiting for confirmation. <a href={explorerTx(txHash)} target="_blank" rel="noreferrer">View on Explorer</a></p>}
        {receipt.isError && <p className="error" role="alert">Transaction was not confirmed: {errorText(receipt.error)}</p>}
        {paidHash && settlementResult && <div className="success"><Check size={22}/><h2>Payment confirmed</h2><p>Seller proceeds: {formatUnits(settlementResult.sellerProceeds, decimals ?? 6)} {tokenSymbol}</p><p>Protocol fee: {formatUnits(settlementResult.fee, decimals ?? 6)} {tokenSymbol}</p>{settlementResult.repayment > 0n && <p>Vault repayment: {formatUnits(settlementResult.repayment, decimals ?? 6)} {tokenSymbol}</p>}<a className="button" href={explorerTx(paidHash)} target="_blank" rel="noreferrer">View on Explorer <ExternalLink size={15}/></a></div>}
      </>}
      <p className="legal">Invoice details and payment state are read from the configured contract. No success is shown before transaction confirmation.</p>
    </section><p className="pay-foot">WhiteSETTL · Whitechain Sepolia · WBT gas token</p>
  </div>;
}
