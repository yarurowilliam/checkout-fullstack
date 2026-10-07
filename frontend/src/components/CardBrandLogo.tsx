import type { CardBrand } from '../domain/card';

export function CardBrandLogo({ brand }: { brand: CardBrand | string | null }) {
  if (brand === 'VISA') {
    return (
      <svg className="brand-logo" viewBox="0 0 48 30" role="img" aria-label="VISA">
        <rect width="48" height="30" rx="4" fill="#1a1f71" />
        <text x="24" y="20" textAnchor="middle" fontSize="13" fontWeight="700" fontStyle="italic" fill="#fff" fontFamily="Arial, sans-serif">
          VISA
        </text>
      </svg>
    );
  }
  if (brand === 'MASTERCARD') {
    return (
      <svg className="brand-logo" viewBox="0 0 48 30" role="img" aria-label="MasterCard">
        <rect width="48" height="30" rx="4" fill="#222" />
        <circle cx="19" cy="15" r="9" fill="#eb001b" />
        <circle cx="29" cy="15" r="9" fill="#f79e1b" fillOpacity="0.9" />
      </svg>
    );
  }
  return null;
}
