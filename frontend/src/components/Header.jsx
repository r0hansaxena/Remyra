import styles from './Header.module.css';

export default function Header({ wallet }) {
    const { isConnected, shortAddress, connectWallet, disconnectWallet, isConnecting } = wallet;

    return (
        <header className={styles.header}>
            <div className={styles.inner}>
                <span className={styles.logo}>Remyra</span>

                <nav className={styles.nav}>
                    <a href="#send" className={styles.navLink}>Send</a>
                    <a href="#features" className={styles.navLink}>Features</a>
                    <a href="#how" className={styles.navLink}>How It Works</a>
                </nav>

                <div className={styles.actions}>
                    {isConnected ? (
                        <button className={`btn btn-secondary btn-sm`} onClick={disconnectWallet}>
                            <span className={styles.dot}></span>
                            {shortAddress}
                        </button>
                    ) : (
                        <button
                            className={`btn btn-primary btn-sm`}
                            onClick={connectWallet}
                            disabled={isConnecting}
                        >
                            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
}
