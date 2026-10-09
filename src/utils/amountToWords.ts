const small = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const tens = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];
function words(n: number): string {
  if (n < 20) return small[n];
  if (n < 100)
    return tens[Math.floor(n / 10)] + (n % 10 ? " " + words(n % 10) : "");
  if (n < 1000)
    return (
      words(Math.floor(n / 100)) +
      " Hundred" +
      (n % 100 ? " " + words(n % 100) : "")
    );
  for (const [v, s] of [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
  ] as const)
    if (n >= v)
      return (
        words(Math.floor(n / v)) + " " + s + (n % v ? " " + words(n % v) : "")
      );
  return "";
}
export function amountToWords(value: number) {
  const cents = Math.round(Math.max(0, value) * 100);
  return (
    "Rupees " +
    words(Math.floor(cents / 100)) +
    (cents % 100 ? " and " + words(cents % 100) + " Paise" : "") +
    " Only"
  );
}
