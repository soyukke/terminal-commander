{
  description = "terminal-commander - Electrobun terminal multiplexer";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f system);
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            buildInputs = [
              pkgs.bun
              pkgs.just
              (pkgs.python3.withPackages (ps: [
                ps.pytest
              ]))
            ];
            shellHook = ''
              export PATH="$PWD/node_modules/.bin:$PATH"
              if [ ! -d node_modules ]; then
                bun install
              fi
            '';
          };
        }
      );
    };
}
