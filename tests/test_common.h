#pragma once

#include <cstdlib>
#include <filesystem>
#include <functional>
#include <iostream>
#include <string>
#include <vector>

struct TestSuite {
  int failed = 0;

  void expect(bool cond, const std::string& msg, const char* file, int line) {
    if (!cond) {
      ++failed;
      std::cerr << file << ":" << line << " expectation failed: " << msg << "\n";
    }
  }
};

#define EXPECT_TRUE(ctx, expr) (ctx).expect((expr), #expr, __FILE__, __LINE__)
#define EXPECT_EQ(ctx, a, b) (ctx).expect(((a) == (b)), std::string(#a " == " #b), __FILE__, __LINE__)

inline std::filesystem::path make_temp_dir(const std::string& name) {
  const auto p = std::filesystem::temp_directory_path() / ("vaultkv-" + name);
  std::error_code ec;
  std::filesystem::remove_all(p, ec);
  std::filesystem::create_directories(p, ec);
  return p;
}

