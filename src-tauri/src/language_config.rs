use std::collections::HashMap;

/// Configuration for an LSP server
#[derive(Debug, Clone)]
pub struct LspServerConfig {
    pub command: &'static str,
    pub args: &'static [&'static str],
}

/// Configuration for running a file of a specific language
#[derive(Debug, Clone)]
pub struct RunConfig {
    pub command: &'static str,
    pub args_template: &'static [&'static str], // Use {file} as placeholder
    pub requires_compilation: bool,
    pub compile_command: Option<CompileConfig>,
}

#[derive(Debug, Clone)]
pub struct CompileConfig {
    pub command: &'static str,
    pub args_template: &'static [&'static str], // Use {file}, {output} as placeholders
    pub output_extension: &'static str,
}

/// Complete language configuration
#[derive(Debug, Clone)]
pub struct LanguageConfig {
    #[allow(dead_code)] // Used for debugging and potential future display
    pub name: &'static str,
    pub lsp: Option<LspServerConfig>,
    pub run: Option<RunConfig>,
    pub file_extensions: &'static [&'static str],
}

/// Get LSP configuration for a language
pub fn get_lsp_config(language: &str) -> Option<LspServerConfig> {
    let configs = get_all_configs();
    configs.get(language).and_then(|cfg| cfg.lsp.clone())
}

/// Get run configuration for a language
pub fn get_run_config(language: &str) -> Option<RunConfig> {
    let configs = get_all_configs();
    configs.get(language).and_then(|cfg| cfg.run.clone())
}

/// Get language key from file extension
pub fn get_language_from_extension(file_path: &str) -> Option<String> {
    let configs = get_all_configs();
    for (key, config) in configs.iter() {
        for ext in config.file_extensions {
            if file_path.ends_with(ext) {
                return Some(key.to_string());
            }
        }
    }
    None
}

/// Get all language configurations
fn get_all_configs() -> HashMap<String, LanguageConfig> {
    let mut configs = HashMap::new();

    // Rust
    configs.insert(
        "rust".to_string(),
        LanguageConfig {
            name: "Rust",
            lsp: Some(LspServerConfig {
                command: "rust-analyzer",
                args: &[],
            }),
            run: Some(RunConfig {
                command: "cargo",
                args_template: &["run"],
                requires_compilation: false, // cargo handles it
                compile_command: None,
            }),
            file_extensions: &[".rs"],
        },
    );

    // Python
    configs.insert(
        "python".to_string(),
        LanguageConfig {
            name: "Python",
            lsp: Some(LspServerConfig {
                command: "pyright-langserver",
                args: &["--stdio"],
            }),
            run: Some(RunConfig {
                command: get_python_command(),
                args_template: &["{file}"],
                requires_compilation: false,
                compile_command: None,
            }),
            file_extensions: &[".py"],
        },
    );

    // TypeScript
    configs.insert(
        "typescript".to_string(),
        LanguageConfig {
            name: "TypeScript",
            lsp: Some(LspServerConfig {
                command: "typescript-language-server",
                args: &["--stdio"],
            }),
            run: Some(RunConfig {
                command: "ts-node",
                args_template: &["{file}"],
                requires_compilation: false,
                compile_command: None,
            }),
            file_extensions: &[".ts", ".tsx"],
        },
    );

    // JavaScript
    configs.insert(
        "javascript".to_string(),
        LanguageConfig {
            name: "JavaScript",
            lsp: Some(LspServerConfig {
                command: "typescript-language-server",
                args: &["--stdio"],
            }),
            run: Some(RunConfig {
                command: "node",
                args_template: &["{file}"],
                requires_compilation: false,
                compile_command: None,
            }),
            file_extensions: &[".js", ".jsx"],
        },
    );

    // Go
    configs.insert(
        "go".to_string(),
        LanguageConfig {
            name: "Go",
            lsp: Some(LspServerConfig {
                command: "gopls",
                args: &[],
            }),
            run: Some(RunConfig {
                command: "go",
                args_template: &["run", "{file}"],
                requires_compilation: false,
                compile_command: None,
            }),
            file_extensions: &[".go"],
        },
    );

    // Java
    configs.insert(
        "java".to_string(),
        LanguageConfig {
            name: "Java",
            lsp: Some(LspServerConfig {
                command: "jdtls",
                args: &[],
            }),
            run: Some(RunConfig {
                command: "java",
                args_template: &["-cp", "{class_dir}", "{main_class}"],
                requires_compilation: true,
                compile_command: Some(CompileConfig {
                    command: "javac",
                    args_template: &["{file}"],
                    output_extension: ".class",
                }),
            }),
            file_extensions: &[".java"],
        },
    );

    // C
    configs.insert(
        "c".to_string(),
        LanguageConfig {
            name: "C",
            lsp: Some(LspServerConfig {
                command: "clangd",
                args: &[],
            }),
            run: Some(RunConfig {
                command: "{output}", // Will be replaced with compiled binary path
                args_template: &[],
                requires_compilation: true,
                compile_command: Some(CompileConfig {
                    command: get_c_compiler(),
                    args_template: &["{file}", "-o", "{output}"],
                    output_extension: get_executable_extension(),
                }),
            }),
            file_extensions: &[".c"],
        },
    );

    // C++
    configs.insert(
        "cpp".to_string(),
        LanguageConfig {
            name: "C++",
            lsp: Some(LspServerConfig {
                command: "clangd",
                args: &[],
            }),
            run: Some(RunConfig {
                command: "{output}",
                args_template: &[],
                requires_compilation: true,
                compile_command: Some(CompileConfig {
                    command: get_cpp_compiler(),
                    args_template: &["{file}", "-o", "{output}"],
                    output_extension: get_executable_extension(),
                }),
            }),
            file_extensions: &[".cpp", ".cc", ".cxx", ".hpp", ".h"],
        },
    );

    // C#
    configs.insert(
        "csharp".to_string(),
        LanguageConfig {
            name: "C#",
            lsp: Some(LspServerConfig {
                command: "omnisharp",
                args: &["--languageserver"],
            }),
            run: Some(RunConfig {
                command: "dotnet",
                args_template: &["run"],
                requires_compilation: false, // dotnet run handles it
                compile_command: None,
            }),
            file_extensions: &[".cs"],
        },
    );

    // PHP
    configs.insert(
        "php".to_string(),
        LanguageConfig {
            name: "PHP",
            lsp: Some(LspServerConfig {
                command: "intelephense",
                args: &["--stdio"],
            }),
            run: Some(RunConfig {
                command: "php",
                args_template: &["{file}"],
                requires_compilation: false,
                compile_command: None,
            }),
            file_extensions: &[".php"],
        },
    );

    // Ruby
    configs.insert(
        "ruby".to_string(),
        LanguageConfig {
            name: "Ruby",
            lsp: Some(LspServerConfig {
                command: "solargraph",
                args: &["stdio"],
            }),
            run: Some(RunConfig {
                command: "ruby",
                args_template: &["{file}"],
                requires_compilation: false,
                compile_command: None,
            }),
            file_extensions: &[".rb"],
        },
    );

    // Bash/Shell
    configs.insert(
        "bash".to_string(),
        LanguageConfig {
            name: "Bash",
            lsp: Some(LspServerConfig {
                command: "bash-language-server",
                args: &["start"],
            }),
            run: Some(RunConfig {
                command: get_shell_command(),
                args_template: &["{file}"],
                requires_compilation: false,
                compile_command: None,
            }),
            file_extensions: &[".sh", ".bash"],
        },
    );

    configs
}

// OS-specific helpers

fn get_python_command() -> &'static str {
    if cfg!(windows) {
        "python.exe"
    } else {
        "python3"
    }
}

fn get_c_compiler() -> &'static str {
    if cfg!(windows) {
        "gcc.exe"
    } else {
        "gcc"
    }
}

fn get_cpp_compiler() -> &'static str {
    if cfg!(windows) {
        "g++.exe"
    } else {
        "g++"
    }
}

fn get_executable_extension() -> &'static str {
    if cfg!(windows) {
        ".exe"
    } else {
        ""
    }
}

fn get_shell_command() -> &'static str {
    if cfg!(windows) {
        "bash.exe" // Assuming Git Bash or WSL
    } else {
        "bash"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_language_from_extension() {
        assert_eq!(get_language_from_extension("main.rs"), Some("rust".to_string()));
        assert_eq!(get_language_from_extension("script.py"), Some("python".to_string()));
        assert_eq!(get_language_from_extension("app.ts"), Some("typescript".to_string()));
        assert_eq!(get_language_from_extension("main.go"), Some("go".to_string()));
        assert_eq!(get_language_from_extension("Main.java"), Some("java".to_string()));
        assert_eq!(get_language_from_extension("program.c"), Some("c".to_string()));
        assert_eq!(get_language_from_extension("program.cpp"), Some("cpp".to_string()));
        assert_eq!(get_language_from_extension("unknown.xyz"), None);
    }

    #[test]
    fn test_get_lsp_config() {
        let rust_lsp = get_lsp_config("rust");
        assert!(rust_lsp.is_some());
        assert_eq!(rust_lsp.unwrap().command, "rust-analyzer");

        let python_lsp = get_lsp_config("python");
        assert!(python_lsp.is_some());
        assert_eq!(python_lsp.unwrap().command, "pyright-langserver");

        let unknown_lsp = get_lsp_config("unknown");
        assert!(unknown_lsp.is_none());
    }

    #[test]
    fn test_get_run_config() {
        let rust_run = get_run_config("rust");
        assert!(rust_run.is_some());
        assert_eq!(rust_run.unwrap().command, "cargo");

        let python_run = get_run_config("python");
        assert!(python_run.is_some());
        
        let c_run = get_run_config("c");
        assert!(c_run.is_some());
        assert!(c_run.unwrap().requires_compilation);
    }
}
