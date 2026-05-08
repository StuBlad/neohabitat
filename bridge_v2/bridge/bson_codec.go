package bridge

import (
	"fmt"
	"reflect"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/bsoncodec"
	"go.mongodb.org/mongo-driver/bson/bsonrw"
	"go.mongodb.org/mongo-driver/bson/bsontype"
)

// uint8Type is the reflect.Type for uint8 (== byte). The custom decoder
// is registered against this type; the default pointer codec dereferences
// *uint8 fields and delegates back here, so registering once handles both
// uint8 and *uint8 fields throughout HabitatMod et al.
var uint8Type = reflect.TypeOf(uint8(0))

// decodeLooseUint8 reads a BSON int as uint8 with two's-complement wrap
// for negative values. Background:
//
// HabitatMod fields like X, Y, Orientation are typed as *uint8 (the
// Habitat wire protocol speaks 8-bit positions). But Elko's Java side
// declares them as `int`, and Java does cast-through-byte arithmetic in
// places — `(int)(byte)254` is -2. The Java JSON serializer that wrote
// these docs to mongo persisted whatever int Java had at that moment, so
// historical user docs contain values like {"y": -2} or {"orientation":
// -127}. The default mongo-driver uint8 decoder rejects those with
// "overflows uint8", which fails ensureUserCreated and bails the login.
//
// The right semantic recovery is to reinterpret the low 8 bits: -2 is
// the same wire byte as 254 (0xFE); decoding it as 254 round-trips back
// to whatever the C64 client actually expects. Out-of-range positives
// (>255 or >127 stuffed into a Java int field) likewise mask to their
// low 8 bits — the upper bits were never meaningful for a uint8 field.
//
// The decoder also accepts BSON Double (some Java writers emit
// floating-point) and Null (treated as zero — same as the default
// behavior for a missing optional field that's been explicitly set
// to null, which we've seen in older mods).
func decodeLooseUint8(dc bsoncodec.DecodeContext, vr bsonrw.ValueReader, val reflect.Value) error {
	if !val.CanSet() || val.Kind() != reflect.Uint8 {
		return bsoncodec.ValueDecoderError{
			Name:     "decodeLooseUint8",
			Kinds:    []reflect.Kind{reflect.Uint8},
			Received: val,
		}
	}
	var n int64
	switch vr.Type() {
	case bsontype.Int32:
		i32, err := vr.ReadInt32()
		if err != nil {
			return err
		}
		n = int64(i32)
	case bsontype.Int64:
		i64, err := vr.ReadInt64()
		if err != nil {
			return err
		}
		n = i64
	case bsontype.Double:
		f, err := vr.ReadDouble()
		if err != nil {
			return err
		}
		n = int64(f)
	case bsontype.Null:
		if err := vr.ReadNull(); err != nil {
			return err
		}
		n = 0
	case bsontype.Undefined:
		if err := vr.ReadUndefined(); err != nil {
			return err
		}
		n = 0
	case bsontype.Boolean:
		// Defensive: some old docs have {"open": false} where the schema
		// expected a uint8. Map false→0, true→1.
		b, err := vr.ReadBoolean()
		if err != nil {
			return err
		}
		if b {
			n = 1
		}
	default:
		return fmt.Errorf("decodeLooseUint8: unexpected BSON type %v", vr.Type())
	}
	val.SetUint(uint64(uint8(n & 0xFF)))
	return nil
}

// looseRegistry returns a BSON registry that tolerates the historical
// signed-byte / int-overrun values noted above. Apply it on the mongo
// client via options.Client().SetRegistry(...).
//
// Only the uint8 decoder is overridden; all other types fall through to
// the default codecs from bson.NewRegistry().
func looseRegistry() *bsoncodec.Registry {
	reg := bson.NewRegistry()
	reg.RegisterTypeDecoder(uint8Type, bsoncodec.ValueDecoderFunc(decodeLooseUint8))
	return reg
}
