package bridge

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

// TestLooseRegistry_NegativeUint8 reproduces the prod failure:
//
//	error decoding key mods.0.y: -2 overflows uint8
//
// The registry must accept the negative int and reinterpret it as the
// equivalent unsigned byte (-2 → 254). All four common int-shaped BSON
// types are exercised because Java JSON serializers can emit any of
// them depending on the numeric range and serializer config that wrote
// the doc originally.
func TestLooseRegistry_NegativeUint8(t *testing.T) {
	reg := looseRegistry()

	type modShim struct {
		Y *uint8 `bson:"y,omitempty"`
	}

	cases := []struct {
		name string
		doc  bson.M
		want uint8
	}{
		{"int32-negative-two", bson.M{"y": int32(-2)}, 254},
		{"int32-negative-one", bson.M{"y": int32(-1)}, 255},
		{"int32-negative-127", bson.M{"y": int32(-127)}, 129},
		{"int32-positive-128", bson.M{"y": int32(128)}, 128},
		{"int32-positive-255", bson.M{"y": int32(255)}, 255},
		{"int32-overrun-300", bson.M{"y": int32(300)}, 44}, // 300 & 0xFF
		{"int64-negative", bson.M{"y": int64(-2)}, 254},
		{"double-negative", bson.M{"y": float64(-2.0)}, 254},
		{"double-positive", bson.M{"y": float64(140.0)}, 140},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			raw, err := bson.MarshalWithRegistry(reg, tc.doc)
			if err != nil {
				t.Fatalf("Marshal: %v", err)
			}
			var got modShim
			if err := bson.UnmarshalWithRegistry(reg, raw, &got); err != nil {
				t.Fatalf("Unmarshal: %v", err)
			}
			if got.Y == nil {
				t.Fatalf("Y was nil; want %d", tc.want)
			}
			if *got.Y != tc.want {
				t.Errorf("Y = %d; want %d", *got.Y, tc.want)
			}
		})
	}
}

// TestLooseRegistry_NullStaysNil confirms what the comment in
// bson_codec.go promises: BSON null in a *uint8 field is intercepted
// by the pointer codec and leaves the pointer nil — our element
// decoder never sees it. If a future driver upgrade changes that
// contract, this test catches the regression so we know to teach
// decodeLooseUint8 about Null.
func TestLooseRegistry_NullStaysNil(t *testing.T) {
	reg := looseRegistry()
	type modShim struct {
		Y *uint8 `bson:"y"`
	}
	raw, err := bson.MarshalWithRegistry(reg, bson.M{"y": nil})
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var got modShim
	if err := bson.UnmarshalWithRegistry(reg, raw, &got); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if got.Y != nil {
		t.Errorf("Y = %d; want nil", *got.Y)
	}
}

// TestLooseRegistry_HabitatModFullDoc decodes a full HabitatObject /
// HabitatMod doc shape that mirrors the prod payload, ensuring the
// failing path (FindOne(...).Decode(user)) succeeds end-to-end.
func TestLooseRegistry_HabitatModFullDoc(t *testing.T) {
	reg := looseRegistry()

	doc := bson.M{
		"ref":  "user-naibor",
		"type": "user",
		"name": "Naibor",
		"mods": []bson.M{
			{
				"type":        "Avatar",
				"x":           int32(80),
				"y":           int32(-2), // the prod failure value
				"orientation": int32(0),
				"bodyType":    "male",
			},
		},
	}
	raw, err := bson.MarshalWithRegistry(reg, doc)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var user HabitatObject
	if err := bson.UnmarshalWithRegistry(reg, raw, &user); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if len(user.Mods) != 1 {
		t.Fatalf("len(Mods) = %d; want 1", len(user.Mods))
	}
	if user.Mods[0].Y == nil || *user.Mods[0].Y != 254 {
		got := uint8(0)
		if user.Mods[0].Y != nil {
			got = *user.Mods[0].Y
		}
		t.Errorf("Mods[0].Y = %d; want 254", got)
	}
	if user.Mods[0].X == nil || *user.Mods[0].X != 80 {
		t.Errorf("Mods[0].X mismatch")
	}
}
