{
  description = "terminal-commander - Electrobun terminal multiplexer";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    zig-overlay.url = "github:mitchellh/zig-overlay";
    zig-overlay.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, zig-overlay }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f system);
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [ zig-overlay.overlays.default ];
          };
          zig = pkgs.zigpkgs."0.15.2";
        in
        {
          default = pkgs.mkShell {
            buildInputs = [
              zig
              pkgs.zls
              pkgs.bun
              (pkgs.python3.withPackages (ps: [
                ps.pytest
              ]))
            ];
            shellHook = ''
              export ZIG_LOCAL_CACHE_DIR="$PWD/.zig-cache"
              export ZIG_GLOBAL_CACHE_DIR="$HOME/.cache/zig"
              # playheavy Python package (editable install)
              export PYTHONPATH="$HOME/dev/zig/playheavy/python:$PYTHONPATH"
            '';
          };
        }
      );
    };
}
