//! Prints reference vectors for Solstice's native runestone codec as JSON.
//!
//! Every byte and every classification below comes from ord's `ordinals` crate
//! (`Runestone::encipher` / `Runestone::decipher`), pinned in Cargo.toml. u128
//! values are written as decimal strings so JSON readers keep full precision.

use {
  bitcoin::{
    absolute::LockTime, opcodes, script, transaction::Version, Amount, ScriptBuf, Transaction,
    TxOut,
  },
  ordinals::{varint, Artifact, Edict, Etching, Rune, RuneId, Runestone, SpacedRune, Terms},
  serde_json::{json, Map, Value},
  std::str::FromStr,
};

const ORD_TAG: &str = "0.29.0";
const ORD_COMMIT: &str = "7e37a3bd3391044b39f5f11f20dfdb8b3764cd0e";

/// A transaction with `outputs` outputs, the runestone script at index 1 (or 0
/// when there is only one output). The other outputs are empty scripts.
fn transaction(script_pubkey: &ScriptBuf, outputs: usize) -> Transaction {
  let position = if outputs > 1 { 1 } else { 0 };
  Transaction {
    version: Version::TWO,
    lock_time: LockTime::ZERO,
    input: Vec::new(),
    output: (0..outputs)
      .map(|i| TxOut {
        value: Amount::ZERO,
        script_pubkey: if i == position {
          script_pubkey.clone()
        } else {
          ScriptBuf::new()
        },
      })
      .collect(),
  }
}

fn rune_id(id: RuneId) -> Value {
  json!({ "block": id.block.to_string(), "tx": id.tx.to_string() })
}

fn opt<T: ToString>(map: &mut Map<String, Value>, key: &str, value: Option<T>) {
  if let Some(value) = value {
    map.insert(key.into(), Value::String(value.to_string()));
  }
}

fn runestone_json(runestone: &Runestone) -> Value {
  let mut map = Map::new();
  if let Some(etching) = runestone.etching {
    let mut e = Map::new();
    opt(&mut e, "rune", etching.rune.map(|rune| rune.0));
    if let Some(divisibility) = etching.divisibility {
      e.insert("divisibility".into(), json!(divisibility));
    }
    if let Some(spacers) = etching.spacers {
      e.insert("spacers".into(), json!(spacers));
    }
    if let Some(symbol) = etching.symbol {
      e.insert("symbol".into(), json!(u32::from(symbol)));
    }
    opt(&mut e, "premine", etching.premine);
    if let Some(terms) = etching.terms {
      let mut t = Map::new();
      opt(&mut t, "amount", terms.amount);
      opt(&mut t, "cap", terms.cap);
      opt(&mut t, "heightStart", terms.height.0);
      opt(&mut t, "heightEnd", terms.height.1);
      opt(&mut t, "offsetStart", terms.offset.0);
      opt(&mut t, "offsetEnd", terms.offset.1);
      e.insert("terms".into(), Value::Object(t));
    }
    e.insert("turbo".into(), json!(etching.turbo));
    map.insert("etching".into(), Value::Object(e));
  }
  if !runestone.edicts.is_empty() {
    map.insert(
      "edicts".into(),
      runestone
        .edicts
        .iter()
        .map(|edict| {
          json!({
            "id": rune_id(edict.id),
            "amount": edict.amount.to_string(),
            "output": edict.output,
          })
        })
        .collect(),
    );
  }
  if let Some(mint) = runestone.mint {
    map.insert("mint".into(), rune_id(mint));
  }
  if let Some(pointer) = runestone.pointer {
    map.insert("pointer".into(), json!(pointer));
  }
  Value::Object(map)
}

/// What ord's decoder makes of `script_pubkey` inside a transaction with
/// `outputs` outputs.
fn deciphered(script_pubkey: &ScriptBuf, outputs: usize) -> Value {
  match Runestone::decipher(&transaction(script_pubkey, outputs)) {
    None => Value::Null,
    Some(Artifact::Runestone(runestone)) => {
      json!({ "type": "runestone", "runestone": runestone_json(&runestone) })
    }
    Some(Artifact::Cenotaph(cenotaph)) => json!({
      "type": "cenotaph",
      "flaw": cenotaph.flaw,
      "etching": cenotaph.etching.map(|rune| rune.0.to_string()),
      "mint": cenotaph.mint.map(rune_id),
    }),
  }
}

fn encipher_vector(name: &str, note: &str, outputs: usize, runestone: Runestone) -> Value {
  let script_pubkey = runestone.encipher();
  json!({
    "name": name,
    "note": note,
    "outputs": outputs,
    "runestone": runestone_json(&runestone),
    "scriptPubKey": script_pubkey.to_hex_string(),
    "ord": deciphered(&script_pubkey, outputs),
  })
}

fn decipher_vector(name: &str, note: &str, outputs: usize, script_pubkey: ScriptBuf) -> Value {
  json!({
    "name": name,
    "note": note,
    "outputs": outputs,
    "scriptPubKey": script_pubkey.to_hex_string(),
    "ord": deciphered(&script_pubkey, outputs),
  })
}

fn payload(integers: &[u128]) -> Vec<u8> {
  let mut payload = Vec::new();
  for integer in integers {
    varint::encode_to_vec(*integer, &mut payload);
  }
  payload
}

/// `OP_RETURN OP_13` followed by one data push per element of `pushes`.
fn script_of(pushes: &[Vec<u8>]) -> ScriptBuf {
  let mut builder = script::Builder::new()
    .push_opcode(opcodes::all::OP_RETURN)
    .push_opcode(Runestone::MAGIC_NUMBER);
  for push in pushes {
    let push: &script::PushBytes = push.as_slice().try_into().unwrap();
    builder = builder.push_slice(push);
  }
  builder.into_script()
}

fn integers(integers: &[u128]) -> ScriptBuf {
  script_of(&[payload(integers)])
}

fn raw(hex: &str) -> ScriptBuf {
  ScriptBuf::from_hex(hex).unwrap()
}

fn id(block: u64, tx: u32) -> RuneId {
  RuneId { block, tx }
}

fn rune(name: &str) -> Rune {
  Rune::from_str(name).unwrap()
}

// Runestone tags, as integers (ordinals keeps its Tag enum private).
const BODY: u128 = 0;
const FLAGS: u128 = 2;
const RUNE: u128 = 4;
const PREMINE: u128 = 6;
const CAP: u128 = 8;
const AMOUNT: u128 = 10;
const MINT: u128 = 20;
const POINTER: u128 = 22;
const DIVISIBILITY: u128 = 1;
const SPACERS: u128 = 3;
const SYMBOL: u128 = 5;

fn main() {
  let receipt = SpacedRune::from_str("SOLSTICE•RECEIPT").unwrap();
  let receipt_id = id(840_000, 7);

  let solstice_etching = Etching {
    divisibility: Some(8),
    premine: Some(2_100_000_000_000_000),
    rune: Some(receipt.rune),
    spacers: Some(receipt.spacers),
    symbol: Some('$'),
    terms: None,
    turbo: true,
  };

  let encipher = vec![
    encipher_vector(
      "etching: full premine, divisibility, symbol, spacers, turbo, pointer 0",
      "The C0 launch runestone, as receiptEtching() + buildEtchTransaction() produce it.",
      3,
      Runestone {
        etching: Some(solstice_etching),
        pointer: Some(0),
        ..Default::default()
      },
    ),
    encipher_vector(
      "etching: no symbol, no spacers",
      "ReceiptRune.symbol and .spacers are optional.",
      2,
      Runestone {
        etching: Some(Etching {
          spacers: None,
          symbol: None,
          ..solstice_etching
        }),
        pointer: Some(0),
        ..Default::default()
      },
    ),
    encipher_vector(
      "etching: multi-byte symbol, divisibility 0, longest name, all spacers",
      "Symbol is a Unicode scalar value; divisibility 0 is still written.",
      2,
      Runestone {
        etching: Some(Etching {
          divisibility: Some(0),
          symbol: Some('₿'),
          premine: Some(1),
          rune: Some(rune("ZZZZZZZZZZZZZZZZZZZZZZZZZZ")),
          spacers: Some(Etching::MAX_SPACERS),
          terms: None,
          turbo: false,
        }),
        ..Default::default()
      },
    ),
    encipher_vector(
      "etching: open-mint terms, divisibility 38",
      "Solstice never sets terms; covered because the codec encodes them.",
      2,
      Runestone {
        etching: Some(Etching {
          divisibility: Some(38),
          premine: Some(1_000),
          rune: Some(rune("AAAAAAAAAAAAA")),
          spacers: None,
          symbol: None,
          terms: Some(Terms {
            amount: Some(100),
            cap: Some(21_000),
            height: (Some(840_000), Some(1_050_000)),
            offset: (Some(1), Some(1_000)),
          }),
          turbo: true,
        }),
        ..Default::default()
      },
    ),
    encipher_vector(
      "single edict with a pointer (rune change to output 1)",
      "C1/C2 swap with rune change: edict to output 0, pointer 1.",
      5,
      Runestone {
        edicts: vec![Edict {
          id: receipt_id,
          amount: 150_000_000,
          output: 0,
        }],
        pointer: Some(1),
        ..Default::default()
      },
    ),
    encipher_vector(
      "single edict, no rune change (pointer 0)",
      "C1/C2 swap that moves the whole input balance: edict and pointer both target output 0.",
      3,
      Runestone {
        edicts: vec![Edict {
          id: receipt_id,
          amount: 2_100_000_000_000_000,
          output: 0,
        }],
        pointer: Some(0),
        ..Default::default()
      },
    ),
    encipher_vector(
      "single edict, no pointer",
      "",
      3,
      Runestone {
        edicts: vec![Edict {
          id: receipt_id,
          amount: 1,
          output: 2,
        }],
        ..Default::default()
      },
    ),
    encipher_vector(
      "several edicts across different rune ids, given unsorted",
      "ord sorts by id and delta-encodes; two edicts share an id, two share a block.",
      6,
      Runestone {
        edicts: vec![
          Edict { id: id(900_000, 3), amount: 5, output: 4 },
          Edict { id: id(840_000, 7), amount: 100, output: 0 },
          Edict { id: id(840_000, 7), amount: 50, output: 2 },
          Edict { id: id(1, 0), amount: u128::MAX, output: 6 },
          Edict { id: id(840_000, 300), amount: 0, output: 3 },
          Edict { id: id(u64::MAX, u32::MAX), amount: 1, output: 5 },
        ],
        pointer: Some(5),
        ..Default::default()
      },
    ),
    encipher_vector(
      "mint with pointer",
      "",
      2,
      Runestone {
        mint: Some(receipt_id),
        pointer: Some(1),
        ..Default::default()
      },
    ),
    encipher_vector(
      "etching, mint, pointer and edicts together",
      "",
      4,
      Runestone {
        etching: Some(solstice_etching),
        mint: Some(id(2, 1)),
        pointer: Some(3),
        edicts: vec![Edict { id: id(0, 0), amount: 9, output: 2 }],
      },
    ),
    encipher_vector(
      "empty runestone",
      "No payload at all: just OP_RETURN OP_13.",
      1,
      Runestone::default(),
    ),
    encipher_vector(
      "payload longer than 520 bytes",
      "ord writes the whole payload as one push, here with OP_PUSHDATA2.",
      3,
      Runestone {
        edicts: (0..100u32)
          .map(|i| Edict {
            id: id(840_000 + u64::from(i), i),
            amount: u128::from(i) << 64,
            output: i % 3,
          })
          .collect(),
        ..Default::default()
      },
    ),
    encipher_vector(
      "payload of 76 to 255 bytes",
      "One push with OP_PUSHDATA1.",
      3,
      Runestone {
        edicts: (0..12u32)
          .map(|i| Edict {
            id: id(840_000 + u64::from(i), i),
            amount: u128::from(i) << 64,
            output: i % 3,
          })
          .collect(),
        ..Default::default()
      },
    ),
  ];

  let etching_flag: u128 = 1;
  let terms_flag: u128 = 2;

  let mut op5 = raw("6a5d020200").into_bytes();
  op5.push(0x55);

  let decipher = vec![
    // ── cenotaphs ───────────────────────────────────────────────────────────
    decipher_vector("unrecognized even tag", "Tag 24 is not assigned.", 2, integers(&[24, 0])),
    decipher_vector(
      "unrecognized even tag: the reserved Cenotaph tag 126",
      "",
      2,
      integers(&[126, 0]),
    ),
    decipher_vector(
      "unrecognized even tag after valid fields keeps etching and mint",
      "ord still reports the etched rune and the mint so both are burned.",
      2,
      integers(&[FLAGS, etching_flag, RUNE, 4, MINT, 1, MINT, 1, 24, 0]),
    ),
    decipher_vector("truncated edict body: 3 integers", "", 2, integers(&[BODY, 1, 1, 2])),
    decipher_vector(
      "truncated edict body: one whole edict then 1 integer",
      "",
      2,
      integers(&[BODY, 1, 1, 2, 0, 5]),
    ),
    decipher_vector("truncated field: tag with no value", "", 2, integers(&[FLAGS])),
    decipher_vector(
      "truncated field after a whole field",
      "",
      2,
      integers(&[POINTER, 0, FLAGS]),
    ),
    decipher_vector(
      "varint overflow: 19 bytes, last byte above 3",
      "",
      2,
      script_of(&[vec![
        0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80,
        0x80, 0x80, 0x80, 0x04,
      ]]),
    ),
    decipher_vector(
      "varint overflow: 19 continuation bytes",
      "",
      2,
      script_of(&[vec![0x80; 19], vec![0x00]]),
    ),
    decipher_vector(
      "varint truncated: ends on a continuation byte",
      "",
      2,
      script_of(&[vec![0x02, 0x80]]),
    ),
    decipher_vector("opcode in payload: OP_VERIFY", "", 2, raw("6a5d69")),
    decipher_vector(
      "opcode in payload: OP_5 where a one-byte push was meant",
      "A minimal-push script compiler turns the push 0x01 0x05 into OP_5, which ord rejects.",
      2,
      ScriptBuf::from_bytes(op5),
    ),
    decipher_vector("invalid script: push runs past the end", "", 2, raw("6a5d0502")),
    decipher_vector(
      "unrecognized flag: bit 3",
      "",
      2,
      integers(&[FLAGS, etching_flag | 8]),
    ),
    decipher_vector(
      "unrecognized flag: terms without etching",
      "",
      2,
      integers(&[FLAGS, terms_flag]),
    ),
    decipher_vector(
      "edict rune id 0:1",
      "Block 0 is only valid with tx 0.",
      2,
      integers(&[BODY, 0, 1, 5, 0]),
    ),
    decipher_vector(
      "edict rune id: block delta overflows u64",
      "",
      2,
      integers(&[BODY, u128::from(u64::MAX), 0, 1, 0, 1, 0, 1, 0]),
    ),
    decipher_vector(
      "edict rune id: tx overflows u32",
      "",
      2,
      integers(&[BODY, 1, u128::from(u32::MAX) + 1, 1, 0]),
    ),
    decipher_vector(
      "edict output above the output count",
      "2 outputs, edict to output 3.",
      2,
      integers(&[BODY, 1, 1, 5, 3]),
    ),
    decipher_vector(
      "pointer at or above the output count",
      "ord leaves the pointer field unconsumed, which makes it an unrecognized even tag.",
      2,
      integers(&[POINTER, 2]),
    ),
    decipher_vector("pointer given twice", "", 2, integers(&[POINTER, 0, POINTER, 1])),
    decipher_vector(
      "flags given twice",
      "",
      2,
      integers(&[FLAGS, etching_flag, FLAGS, 0]),
    ),
    decipher_vector(
      "mint with one integer",
      "Mint needs two values (block, tx).",
      2,
      integers(&[MINT, 1]),
    ),
    decipher_vector("mint 0:1", "", 2, integers(&[MINT, 0, MINT, 1])),
    decipher_vector(
      "etching fields without the etching flag",
      "Rune and premine are even tags nobody consumes.",
      2,
      integers(&[RUNE, 4, PREMINE, 1]),
    ),
    decipher_vector(
      "supply overflow",
      "premine + cap * amount exceeds u128.",
      2,
      integers(&[
        FLAGS,
        etching_flag | terms_flag,
        PREMINE,
        u128::MAX,
        CAP,
        1,
        AMOUNT,
        1,
      ]),
    ),
    // ── valid, but easy to get wrong ────────────────────────────────────────
    decipher_vector(
      "valid: unrecognized odd tag is ignored",
      "",
      2,
      integers(&[POINTER, 1, 127, 9, 99, 1]),
    ),
    decipher_vector(
      "valid: edict output equal to the output count",
      "Means: split between all non-OP_RETURN outputs.",
      2,
      integers(&[BODY, 1, 1, 5, 2]),
    ),
    decipher_vector(
      "valid: payload split over several pushes, one of them empty",
      "ord concatenates the pushes; OP_0 is an empty push.",
      2,
      script_of(&[vec![0x16], vec![], vec![0x01, 0x00], payload(&[1, 1, 5, 0])]),
    ),
    decipher_vector(
      "valid: one-byte pushes written as data, not OP_N",
      "0x01 0x16 0x01 0x01 is pointer = 1.",
      2,
      raw("6a5d01160101"),
    ),
    decipher_vector(
      "valid: OP_PUSHDATA1 and OP_PUSHDATA4 for a short payload",
      "Non-minimal push opcodes are fine.",
      2,
      raw("6a5d4c01164e0100000001"),
    ),
    decipher_vector(
      "valid: divisibility 39 is ignored",
      "Out-of-range odd fields are dropped, not flaws.",
      2,
      integers(&[FLAGS, etching_flag, DIVISIBILITY, 39]),
    ),
    decipher_vector(
      "valid: spacers above the maximum are ignored",
      "",
      2,
      integers(&[FLAGS, etching_flag, SPACERS, u128::from(Etching::MAX_SPACERS) + 1]),
    ),
    decipher_vector(
      "valid: symbol that is not a Unicode scalar value is ignored",
      "",
      2,
      integers(&[FLAGS, etching_flag, SYMBOL, 0xD800]),
    ),
    decipher_vector(
      "valid: repeated odd field keeps the first value",
      "",
      2,
      integers(&[FLAGS, etching_flag, DIVISIBILITY, 4, DIVISIBILITY, 5]),
    ),
    decipher_vector(
      "valid: etching with no rune name",
      "ord assigns a reserved name; no commitment is needed.",
      2,
      integers(&[FLAGS, etching_flag, PREMINE, 10]),
    ),
    decipher_vector(
      "valid: fields after the body are edict integers",
      "",
      2,
      integers(&[BODY, 1, 1, 5, 0, 0, 22, 1, 1]),
    ),
    decipher_vector(
      "valid: varint padded to 18 bytes",
      "Non-minimal LEB128 is accepted up to 18 bytes.",
      2,
      script_of(&[vec![
        0x96, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80,
        0x80, 0x80, 0x00, 0x01,
      ]]),
    ),
    decipher_vector("not a runestone: OP_RETURN OP_12", "", 2, raw("6a5c0100")),
    decipher_vector(
      "not a runestone: push of 0x0d instead of OP_13",
      "",
      2,
      raw("6a010d"),
    ),
  ];

  let names: Vec<Value> = [
    "A",
    "Z",
    "AA",
    "AAAAAAAAAAAAA",
    "SOLSTICERECEIPT",
    "ZZZZZZZZZZZZZZZZZZZZZZZZZZ",
    "BCGDENLQRQWDSLRUGSNLBTMFIJAV",
  ]
  .iter()
  .map(|name| {
    let rune = rune(name);
    json!({
      "name": name,
      "number": rune.0.to_string(),
      "commitment": rune.commitment().iter().map(|b| format!("{b:02x}")).collect::<String>(),
    })
  })
  .collect();

  let spaced: Vec<Value> = ["SOLSTICE•RECEIPT", "A•B•C", "CALADAN•RT", "EXAMPLERUNE"]
    .iter()
    .map(|name| {
      let spaced = SpacedRune::from_str(name).unwrap();
      json!({
        "spaced": spaced.to_string(),
        "name": spaced.rune.to_string(),
        "spacers": spaced.spacers,
      })
    })
    .collect();

  let out = json!({
    "source": {
      "repository": "https://github.com/ordinals/ord",
      "tag": ORD_TAG,
      "commit": ORD_COMMIT,
      "crate": "crates/ordinals",
      "generator": "packages/solstice/tests/vectors/ord-oracle",
    },
    "encipher": encipher,
    "decipher": decipher,
    "runeNames": names,
    "spacedRunes": spaced,
  });

  println!("{}", serde_json::to_string_pretty(&out).unwrap());
}
