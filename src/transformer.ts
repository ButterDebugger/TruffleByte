import { TransformerTagTakenError, UnknownTagError } from "./errors.ts";
import { VarintTransformer } from "./tagless/varint.ts";

const transformers: Map<number, Transformer<unknown>> = new Map();

/** Checks if the transformer is applicable for the given value */
export type ApplicableFunction<In> = (v: unknown) => v is In;
/** Serializes the value into the encoder */
export type SerializeFunction<In> = (encoder: Encoder, value: In) => void; // | Promise<void>;
/** Deserializes the value from the decoder */
export type DeserializeFunction<In> = (decoder: Decoder) => In;

/** A transformer for a specific data type */
export type Transformer<In> = {
	/** Checks if the transformer is applicable for the given value */
	isApplicable: ApplicableFunction<In>;
	/** Serializes the value into the encoder */
	serialize: SerializeFunction<In>;
	/** Deserializes the value from the decoder */
	deserialize: DeserializeFunction<In>;
};

/**
 * The encoder class which transformers use
 */
export class Encoder {
	private growthFactor = 2;
	private capacity: number;
	private size = 0;
	private buffer: Uint8Array<ArrayBuffer>;

	constructor(initialCapacity = 256) {
		this.capacity = initialCapacity;
		this.buffer = new Uint8Array(this.capacity);
	}

	/**
	 * Ensures the buffer has enough capacity
	 */
	private ensureCapacity(addedLength: number): void {
		const requiredCapacity = this.size + addedLength;

		// Check if the buffer needs to be resized
		if (requiredCapacity > this.capacity) {
			// Grow the buffer exponentially by the growth factor
			this.capacity = Math.max(
				Math.ceil(this.capacity * this.growthFactor),
				requiredCapacity,
			);

			// Create new buffer and copy the date
			const newBuffer = new Uint8Array(this.capacity);
			newBuffer.set(this.buffer, 0);
			this.buffer = newBuffer;
		}
	}

	/**
	 * Writes an Uint8Array to the encoder
	 */
	write(bytes: Uint8Array<ArrayBuffer>): void {
		// Ensure the buffer has enough capacity
		this.ensureCapacity(bytes.length);

		// Write the bytes
		this.buffer.set(bytes, this.size);
		this.size += bytes.length;
	}

	/**
	 * Writes a single byte to the encoder
	 */
	writeByte(byte: number): void {
		// Ensure the buffer has enough capacity
		this.ensureCapacity(1);

		// Write the byte
		this.buffer[this.size++] = byte;
	}

	/**
	 * Chains another transformer to encode a value
	 */
	chain<In>(transformer: Transformer<In>, value: In): void {
		transformer.serialize(this, value);
	}

	/**
	 * Encodes a value
	 */
	serialize(value: unknown): void {
		for (const [tag, transformer] of transformers.entries()) {
			if (transformer.isApplicable(value)) {
				// Write the tag if the transformer is not untagged
				this.chain(VarintTransformer, tag);

				// Serialize the value
				transformer.serialize(this, value);
				return;
			}
		}
		throw new UnknownTagError(-1);
	}

	/**
	 * Returns the final Uint8Array containing only the written data
	 */
	merge(): Uint8Array<ArrayBuffer> {
		return this.buffer.subarray(0, this.size);
	}
}

/**
 * The decoder class which transformers use
 */
export class Decoder {
	private cursor = 0;

	constructor(private bytes: Uint8Array<ArrayBuffer>) {}

	/**
	 * Reads and removes a number of bytes from the content
	 * @param length The number of bytes to read
	 * @returns The read bytes
	 */
	read(length: number): Uint8Array<ArrayBuffer> {
		const content = this.bytes.subarray(this.cursor, this.cursor + length);
		this.cursor += length;
		return content;
	}

	/**
	 * Reads and removes a single byte from the content
	 * @returns The read byte
	 */
	readByte(): number {
		return this.bytes[this.cursor++];
	}

	/**
	 * Reads a number of bytes from the content without removing them
	 * @param length The number of bytes to read
	 * @returns The read bytes
	 */
	peek(length: number): Uint8Array<ArrayBuffer> {
		return this.bytes.subarray(this.cursor, this.cursor + length);
	}

	/**
	 * Reads a single byte from the content without removing it
	 * @returns The read byte
	 */
	peekByte(): number {
		return this.bytes[this.cursor];
	}

	/**
	 * Attempts to decode the content a single time
	 * @returns The decoded value
	 */
	deserialize(): unknown {
		const tag = this.chain(VarintTransformer);
		const transformer = transformers.get(tag);

		if (!transformer) {
			throw new UnknownTagError(tag);
		}

		return transformer.deserialize(this);
	}

	/**
	 * Chain another transformer to decode the content
	 * @returns The decoded value from the transformer
	 */
	chain<In>(transformer: Transformer<In>): In {
		return transformer.deserialize(this);
	}
}

/**
 * Registers a new transformer
 * @param tag The tag to use for the transformer
 * @param transformer The transformer to register
 * @returns The registered transformer
 */
export function registerTransformer<In>(
	tag: number,
	transformer: Transformer<In>,
): Transformer<In> {
	// Check if the tag is already used
	if (transformers.has(tag)) {
		throw new TransformerTagTakenError(tag);
	}

	// Register the transformer under the tag
	transformers.set(tag, transformer as Transformer<unknown>);

	// Return the transformer
	return transformer;
}

/**
 * Encodes the data into a binary format
 * @param value The input data
 * @returns The data serialized into a binary format
 */
export function encode(value: unknown): Uint8Array<ArrayBuffer> {
	const encoder = new Encoder();

	// Serialize the value
	encoder.serialize(value);

	// Return the encoded result as an Uint8Array
	return encoder.merge();
}

/**
 * Decodes the encoded input back into data
 * @param bytes The input Uint8Array
 * @returns The deserialized data structure of the binary format
 */
export function decode(bytes: Uint8Array<ArrayBuffer>): unknown {
	const decoder = new Decoder(bytes);

	// Return the decoded result
	return decoder.deserialize();
}
