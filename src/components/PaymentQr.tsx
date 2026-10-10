import { useState } from "react";

export function PaymentQr(props: {
  source: string;
  alt: string;
  className?: string;
}) {
  return <QrImage key={props.source} {...props} />;
}

function QrImage({
  source,
  alt,
  className,
}: {
  source: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed)
    return (
      <div className="qr-image-error" role="alert">
        QR image unavailable. Retry or replace it in Business settings.
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt(attempt + 1);
          }}
        >
          Retry image
        </button>
      </div>
    );
  return (
    <img
      key={attempt}
      src={source}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
