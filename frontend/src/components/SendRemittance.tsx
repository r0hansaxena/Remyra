"use client";

import { useState } from 'react';
import { TOKENS, DEST_CHAINS, CORRIDORS, Corridor } from '../constants';
import { WalletState } from '../hooks/useWallet';
import styles from './SendRemittance.module.css';

interface SendRemittanceProps {
    wallet: WalletState;
}

interface TxResult {
    id: number;
    amount: string;
    token: string;
    recipient: string;
    destCurrency: string;
    fee: string;
    convertedAmount: string;
    status: string;
    timestamp: string;
}

export default function SendRemittance({ wallet }: SendRemittanceProps) {
    const [token, setToken] = useState('USDT');
    const [amount, setAmount] = useState('');
    const [recipient, setRecipient] = useState('');
    const [destChain, setDestChain] = useState(0);
    const [corridor, setCorridor] = useState('INR');
    const [sending, setSending] = useState(false);
    const [txResult, setTxResult] = useState<TxResult | null>(null);

    const selectedCorridor = CORRIDORS.find(c => c.to === corridor) || CORRIDORS[0];
    const fee = amount ? (parseFloat(amount) * 0.003).toFixed(2) : '0.00';
    const amountAfterFee = amount ? (parseFloat(amount) - parseFloat(fee)).toFixed(2) : '0.00';
    const convertedAmount = amount ? (parseFloat(amountAfterFee) * selectedCorridor.rate).toFixed(2) : '0.00';

    const traditionalFee = amount ? (parseFloat(amount) * 0.053).toFixed(2) : '0.00';
    const savings = amount ? (parseFloat(traditionalFee) - parseFloat(fee)).toFixed(2) : '0.00';

    const handleSend = async () => {
        if (!wallet.isConnected) {
            wallet.connectWallet();
            return;
        }

        setSending(true);
        setTxResult(null);

        // Simulate transaction for demo
        await new Promise(r => setTimeout(r, 2000));

        setTxResult({
            id: Math.floor(Math.random() * 10000),
            amount: amount,
            token: token,
            recipient: recipient || '0x742d...4b2F',
            destCurrency: corridor,
            fee: fee,
            convertedAmount: convertedAmount,
            status: destChain > 0 ? 'Cross-chain Sent' : 'Completed',
            timestamp: new Date().toLocaleString(),
        });
        setSending(false);
    };

    return (
        <section id="send" className={styles.section}>
            <h2 className="page-title">Send Remittance</h2>
            <p className={styles.subtitle}>Transfer stablecoins globally with sub-1% fees using Polkadot's XCM</p>

            <div className={styles.grid}>
                {/* Send Form */}
                <div className={`glass-card ${styles.formCard}`}>
                    <div className={styles.formHeader}>
                        <span className={styles.formIcon}>⇄</span>
                        <h3>Transfer Details</h3>
                    </div>

                    <div className={styles.formBody}>
                        {/* Token Select */}
                        <div className="input-group">
                            <label>Token</label>
                            <div className={styles.tokenSelect}>
                                {TOKENS.map(t => (
                                    <button
                                        key={t.symbol}
                                        type="button"
                                        className={`${styles.tokenOption} ${token === t.symbol ? styles.tokenActive : ''}`}
                                        onClick={() => setToken(t.symbol)}
                                    >
                                        <span>{t.icon}</span>
                                        <span>{t.symbol}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Amount */}
                        <div className="input-group">
                            <label>Amount (USD)</label>
                            <div className={styles.amountWrap}>
                                <span className={styles.amountPrefix}>$</span>
                                <input
                                    type="number"
                                    className={`input-field ${styles.amountInput}`}
                                    placeholder="1,000.00"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    min="0"
                                />
                            </div>
                        </div>

                        {/* Corridor */}
                        <div className="input-group">
                            <label>Destination Currency</label>
                            <select
                                className="input-field"
                                value={corridor}
                                onChange={(e) => setCorridor(e.target.value)}
                            >
                                {CORRIDORS.map(c => (
                                    <option key={c.to} value={c.to}>
                                        {c.country} ({c.to}) — 1 USD = {c.rate} {c.to}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Destination Chain */}
                        <div className="input-group">
                            <label>Destination Chain</label>
                            <select
                                className="input-field"
                                value={destChain}
                                onChange={(e) => setDestChain(Number(e.target.value))}
                            >
                                {DEST_CHAINS.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.icon} {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Recipient */}
                        <div className="input-group">
                            <label>Recipient Address</label>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="0x..."
                                value={recipient}
                                onChange={(e) => setRecipient(e.target.value)}
                            />
                        </div>

                        {/* Send Button */}
                        <button
                            type="button"
                            className={`btn btn-primary ${styles.sendBtn}`}
                            onClick={handleSend}
                            disabled={sending || !amount}
                        >
                            {sending ? (
                                <><span className={styles.spinner}></span> Processing...</>
                            ) : !wallet.isConnected ? (
                                'Connect Wallet to Send'
                            ) : (
                                `Send ${amount || '0'} ${token}`
                            )}
                        </button>
                    </div>
                </div>

                {/* Fee Breakdown Card */}
                <div className={styles.rightCol}>
                    <div className={`glass-card ${styles.feeCard}`}>
                        <div className={styles.feeHeader}>
                            <h3>Fee Breakdown</h3>
                            <span className={styles.feeBadge}>0.30%</span>
                        </div>

                        <div className={styles.feeRows}>
                            <div className={styles.feeRow}>
                                <span>You send</span>
                                <span className={styles.feeValue}>${amount || '0.00'} {token}</span>
                            </div>
                            <div className={styles.feeRow}>
                                <span>Remyra fee</span>
                                <span className={styles.feeValueGreen}>-${fee}</span>
                            </div>
                            <div className={styles.feeRow}>
                                <span>Exchange rate</span>
                                <span className={styles.feeValue}>1 USD = {selectedCorridor.rate} {corridor}</span>
                            </div>
                            <div className={`${styles.feeRow} ${styles.feeTotal}`}>
                                <span>Recipient gets</span>
                                <span className={styles.feeValueLarge}>{convertedAmount} {corridor}</span>
                            </div>
                        </div>

                        {amount && parseFloat(amount) > 0 && (
                            <div className={styles.savingsBox}>
                                <span className={styles.savingsIcon}>△</span>
                                <div>
                                    <div className={styles.savingsTitle}>You save ${savings}</div>
                                    <div className={styles.savingsDesc}>compared to Western Union</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Tech Stack Badge */}
                    <div className={`glass-card ${styles.techCard}`}>
                        <h4 className={styles.techTitle}>Powered by Polkadot PVM</h4>
                        <div className={styles.techBadges}>
                            <span className={styles.techBadge}>⊞ Rust FX Oracle</span>
                            <span className={styles.techBadge}>⟁ XCM Cross-chain</span>
                            <span className={styles.techBadge}>◉ Native Assets</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Transaction Result Modal */}
            {txResult && (
                <div className={styles.modal} onClick={() => setTxResult(null)}>
                    <div className={`glass-card ${styles.modalContent}`} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalIcon}>✓</div>
                        <h3 className={styles.modalTitle}>Remittance {txResult.status}!</h3>
                        <div className={styles.modalDetails}>
                            <div className={styles.modalRow}>
                                <span>Remittance ID</span><span>#{txResult.id}</span>
                            </div>
                            <div className={styles.modalRow}>
                                <span>Amount Sent</span><span>${txResult.amount} {txResult.token}</span>
                            </div>
                            <div className={styles.modalRow}>
                                <span>Recipient Gets</span><span>{txResult.convertedAmount} {txResult.destCurrency}</span>
                            </div>
                            <div className={styles.modalRow}>
                                <span>Fee</span><span>${txResult.fee} (0.30%)</span>
                            </div>
                            <div className={styles.modalRow}>
                                <span>Time</span><span>{txResult.timestamp}</span>
                            </div>
                        </div>
                        <button type="button" className="btn btn-primary" onClick={() => setTxResult(null)} style={{ width: '100%', marginTop: '16px' }}>
                            Done
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
