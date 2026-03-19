cmake_minimum_required(VERSION 3.20)
project(vaultkv VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(VAULTKV_BUILD_TESTS "Build VaultKV tests" ON)
option(VAULTKV_BUILD_BENCH "Build VaultKV benchmark executable" ON)

if(MSVC)
  add_compile_options(/W4 /permissive-)
else()
  add_compile_options(
    -Wall
    -Wextra
    -Wpedantic
    -Wno-unused-parameter
    -Wno-sign-compare
  )
endif()

find_package(OpenSSL QUIET)
find_package(Threads REQUIRED)

set(VAULTKV_LIB_SOURCES
  src/util.cpp
  src/protocol.cpp
  src/crypto.cpp
  src/wal.cpp
  src/memtable.cpp
  src/sstable.cpp
  src/compaction.cpp
  src/raft.cpp
  src/replication.cpp
  src/storage_engine.cpp
  src/server.cpp
)

add_library(vaultkv_lib STATIC ${VAULTKV_LIB_SOURCES})
target_include_directories(vaultkv_lib PUBLIC include)
target_link_libraries(vaultkv_lib PUBLIC Threads::Threads)
if(OpenSSL_FOUND)
  target_link_libraries(vaultkv_lib PUBLIC OpenSSL::SSL OpenSSL::Crypto)
  target_compile_definitions(vaultkv_lib PUBLIC VAULTKV_HAS_OPENSSL=1)
else()
  message(WARNING "OpenSSL not found. Building with insecure fallback crypto (development only).")
  target_compile_definitions(vaultkv_lib PUBLIC VAULTKV_HAS_OPENSSL=0)
endif()

add_executable(vaultkv-server src/main.cpp)
target_link_libraries(vaultkv-server PRIVATE vaultkv_lib)

add_executable(vaultkv-cli tools/vaultkv-cli.cpp)
target_link_libraries(vaultkv-cli PRIVATE vaultkv_lib)

add_executable(vaultkv-inspect tools/vaultkv-inspect.cpp)
target_link_libraries(vaultkv-inspect PRIVATE vaultkv_lib)

if(VAULTKV_BUILD_TESTS)
  enable_testing()
  add_executable(vaultkv_tests
    tests/test_main.cpp
    tests/test_protocol.cpp
    tests/test_wal.cpp
    tests/test_memtable.cpp
    tests/test_sstable.cpp
    tests/test_compaction.cpp
    tests/test_replication.cpp
    tests/test_storage_engine.cpp
  )
  target_link_libraries(vaultkv_tests PRIVATE vaultkv_lib)
  add_test(NAME vaultkv_tests COMMAND vaultkv_tests)
endif()

if(VAULTKV_BUILD_BENCH)
  add_executable(vaultkv-bench bench/bench_main.cpp)
  target_link_libraries(vaultkv-bench PRIVATE vaultkv_lib)
endif()
