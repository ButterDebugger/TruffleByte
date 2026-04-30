import { Tags } from "../codec.ts";
import { registerTransformer, type Transformer } from "../transformer.ts";
import { VarintTransformer } from "../tagless/varint.ts";

/** Max length of a string that would be cached */
const MAX_STRING_CACHE_LENGTH = 64;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

/** Encoded strings cache for small strings */
const stringCache: Record<string, Uint8Array<ArrayBuffer> | undefined> = {};

/** Transformer for strings */
export const StringTransformer: Transformer<string> = registerTransformer<string>(Tags.String, {
	isApplicable: (value): value is string => typeof value === "string",
	serialize: (encoder, string) => {
		// Check if the string is small enough to be cached
		if (string.length < MAX_STRING_CACHE_LENGTH) {
			let encoded = stringCache[string];

			if (!encoded) {
				// Cache the encoded string
				encoded = textEncoder.encode(string);
				stringCache[string] = encoded;
			}

			// Write the string length and possibly cached encoded string
			encoder.chain(VarintTransformer, encoded.length);
			encoder.write(encoded);
			return;
		}

		// Write the string length and the encoded string
		const text = textEncoder.encode(string);
		encoder.chain(VarintTransformer, text.length);
		encoder.write(text);
	},
	deserialize: (decoder) => {
		const length = decoder.chain(VarintTransformer);
		return textDecoder.decode(decoder.read(length));
	},
});
