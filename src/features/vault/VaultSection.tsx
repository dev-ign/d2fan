import { useLocale, vaultCopy } from "../../hooks/useLocale";
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
  const { t } = useLocale();
  const copy = vaultCopy(item, t);
  return (
    <button
      type="button"
      className={`vault-card ${className}`}
      onClick={() => onSelect(item)}
      aria-label={`${copy.title}, ${copy.label}, ${item.status === "available" ? "$" + item.priceMinor / 100 : t.common.comingSoon}`}
    >
      <img src={item.artworkUrl} alt="" loading="lazy" />
      <span className="vault-shade" />
      <span className="vault-card-content">
        <span className="eyebrow red-text">{copy.label}</span>
        <strong>{copy.title}</strong>
        {item.type === "audio" && <Waveform bars={104} />}
        <span className="vault-card-footer">
          <span>{copy.description}</span>
          {
            <span>
              <img src="/assets/lock.svg" alt="" width="12" height="12" /> $
              {item.priceMinor / 100} ·{" "}
              {item.status === "available"
                ? t.common.unlock
                : t.common.comingSoon}
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
  const { t } = useLocale();
  const [archiveOpen, setArchiveOpen] = useState(false);
  return (
    <section className="vault-section" id="vault" aria-labelledby="vault-title">
      <div className="container">
        <div className="section-intro vault-intro reveal">
          <h2 id="vault-title" className="editorial-heading">
            <span>{t.vault.first}</span>
            <em>{t.vault.second}</em>
          </h2>
          <p>{t.vault.intro}</p>
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
          <p>{t.vault.tail}</p>
          <button
            className="button button--outline"
            type="button"
            onClick={() => setArchiveOpen(true)}
          >
            {t.vault.rest}
          </button>
        </div>
      </div>
      {archiveOpen && (
        <Dialog
          title={t.vault.archive}
          onClose={() => setArchiveOpen(false)}
          className="archive-dialog"
        >
          <p className="eyebrow red-text">
            {t.vault.first} {t.vault.second}
          </p>
          <h2 className="display-heading">
            {t.vault.more} <em>{t.vault.coming}</em>
          </h2>
          <p>{t.vault.preparing}</p>
        </Dialog>
      )}
    </section>
  );
}
