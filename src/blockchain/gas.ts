export const gasCost = (gasUsed: bigint, effectiveGasPrice: bigint): bigint => gasUsed * effectiveGasPrice;
