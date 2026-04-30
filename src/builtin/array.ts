import { Tags } from "../codec.ts";
import { VarintTransformer } from "../tagless/varint.ts";
import { registerTransformer, type Transformer } from "../transformer.ts";

/** Transformer for arrays */
export const ArrayTransformer: Transformer<unknown[]> = registerTransformer<unknown[]>(Tags.Array, {
	isApplicable: (value) => Array.isArray(value),
	serialize: (encoder, array) => {
		// Write the length of the array
		encoder.chain(VarintTransformer, array.length);

		// Write each item in the array
		for (const item of array) {
			encoder.serialize(item);
		}
	},
	deserialize: (decoder) => {
		const length = decoder.chain(VarintTransformer);
		const array = Array.from({ length });

		// Read each item in the array
		for (let i = 0; i < length; i++) {
			array[i] = decoder.deserialize();
		}

		return array;
	},
});
