export const getFirstName = (fullName?: string | null): string => {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  const firstPart = trimmed.split(/\s+/)[0];
  return firstPart || trimmed;
};
