import { useState } from "react";
import type { VaultItem } from "../../domain/types";
import { Dialog } from "../../components/Dialog";
import { Waveform } from "../../components/Waveform";

function VaultCard({
  item,
  onSelect,
  className = "",
}: {
  item: VaultItem;
  onSelect: (item: VaultItem) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`vault-card ${className}`}
      onClick={() => onSelect(item)}
      aria-label={`${item.title}, ${item.label}, ${item.status === "available" ? "$" + item.priceMinor / 100 : "coming soon"}`}
    >
      <img src={item.artworkUrl} alt="" loading="lazy" />
      <span className="vault-shade" />
      <span className="vault-card-content">
        <span className="eyebrow red-text">{item.label}</span>
        <strong>{item.title}</strong>
        {item.type === "audio" && <Waveform bars={104} />}
        <span className="vault-card-footer">
          <span>{item.description}</span>
          {
            <span>
              <img src="/assets/lock.svg" alt="" width="12" height="12" /> $
              {item.priceMinor / 100} ·{" "}
              {item.status === "available" ? "unlock" : "coming soon"}
            </span>
          }
        </span>
      </span>
    </button>
  );
}

export function VaultSection({
  items,
  onSupport,
}: {
  items: VaultItem[];
  onSupport: (item: VaultItem) => void;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  return (
    <section className="vault-section" id="vault" aria-labelledby="vault-title">
      <div className="container">
        <div className="section-intro vault-intro reveal">
          <h2 id="vault-title" className="editorial-heading">
            <span>THE</span>
            <em>VAULT.</em>
          </h2>
          <p>
            Your support goes a long way. And for that you get to own a piece of
            the process. These exclusive items are only available to you and
            have not been seen by the world.
          </p>
        </div>
        <div className="vault-grid reveal">
          {items.slice(0, 2).map((item) => (
            <VaultCard key={item.id} item={item} onSelect={onSupport} />
          ))}
          <div className="vault-stack">
            {items.slice(2, 4).map((item) => (
              <VaultCard key={item.id} item={item} onSelect={onSupport} />
            ))}
          </div>
        </div>
        <div className="vault-tail">
          <p>
            + 14 more in the archive · stems, lyric sheets, alternate versions,
            limited merch
          </p>
          <button
            className="button button--outline"
            type="button"
            onClick={() => setArchiveOpen(true)}
          >
            See the rest of the vault.
          </button>
        </div>
      </div>
      {archiveOpen && (
        <Dialog
          title="The Vault archive"
          onClose={() => setArchiveOpen(false)}
          className="archive-dialog"
        >
          <p className="eyebrow red-text">THE VAULT</p>
          <h2 className="display-heading">
            MORE IS <em>COMING.</em>
          </h2>
          <p>
            The remaining archive items are being prepared. The four pieces
            shown on this page are previews; access and fulfillment will open
            when secure checkout is ready.
          </p>
        </Dialog>
      )}
    </section>
  );
}
