#include "test_common.h"

#include "vaultkv/protocol.h"
#include "vaultkv/util.h"

using vaultkv::protocol::OpType;
using vaultkv::protocol::Protocol;

void run_protocol_tests(TestSuite& t) {
  // SET encode/decode
  std::string payload;
  vaultkv::util::append_le<uint16_t>(&payload, 3);
  payload.append("foo");
  vaultkv::util::append_le<uint32_t>(&payload, 3);
  payload.append("bar");
  auto frame_bytes = Protocol::EncodeFrame(OpType::SET, 0, payload);

  std::vector<uint8_t> stream(frame_bytes.begin(), frame_bytes.end());
  std::vector<vaultkv::protocol::Frame> out;
  std::string err;
  EXPECT_TRUE(t, Protocol::TryParseFrames(&stream, &out, &err));
  EXPECT_EQ(t, out.size(), static_cast<size_t>(1));
  EXPECT_EQ(t, stream.size(), static_cast<size_t>(0));

  vaultkv::protocol::Command cmd;
  EXPECT_TRUE(t, Protocol::DecodeCommand(out[0], &cmd, &err));
  EXPECT_EQ(t, cmd.key, std::string("foo"));
  EXPECT_EQ(t, cmd.value, std::string("bar"));

  // Partial read
  std::vector<uint8_t> partial(frame_bytes.begin(), frame_bytes.begin() + 4);
  out.clear();
  EXPECT_TRUE(t, Protocol::TryParseFrames(&partial, &out, &err));
  EXPECT_EQ(t, out.size(), static_cast<size_t>(0));
  partial.insert(partial.end(), frame_bytes.begin() + 4, frame_bytes.end());
  EXPECT_TRUE(t, Protocol::TryParseFrames(&partial, &out, &err));
  EXPECT_EQ(t, out.size(), static_cast<size_t>(1));
}

