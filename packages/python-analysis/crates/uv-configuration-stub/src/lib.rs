use std::str::FromStr;

use uv_normalize::PackageName;

/// Specifier for `--no-binary` / `--only-binary` arguments.
#[derive(Debug, Clone)]
pub enum PackageNameSpecifier {
    /// `:all:` — applies to all packages.
    All,
    /// `:none:` — applies to no packages (reset).
    None,
    /// A specific package name.
    Package(PackageName),
}

impl FromStr for PackageNameSpecifier {
    type Err = uv_normalize::InvalidNameError;

    fn from_str(name: &str) -> Result<Self, Self::Err> {
        match name {
            ":all:" => Ok(Self::All),
            ":none:" => Ok(Self::None),
            _ => Ok(Self::Package(PackageName::from_str(name)?)),
        }
    }
}

/// Whether to allow binary (wheel) installations.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub enum NoBinary {
    /// Allow any wheels.
    #[default]
    None,
    /// Disallow all wheels.
    All,
    /// Disallow specific packages' wheels.
    Packages(Vec<PackageName>),
}

impl NoBinary {
    /// Construct from a single pip-style specifier.
    pub fn from_pip_arg(specifier: PackageNameSpecifier) -> Self {
        Self::from_pip_args(vec![specifier])
    }

    /// Construct from pip-style specifiers.
    pub fn from_pip_args(specifiers: Vec<PackageNameSpecifier>) -> Self {
        let mut packages = Vec::new();
        for spec in specifiers {
            match spec {
                PackageNameSpecifier::All => return Self::All,
                PackageNameSpecifier::None => return Self::None,
                PackageNameSpecifier::Package(name) => packages.push(name),
            }
        }
        if packages.is_empty() {
            Self::None
        } else {
            Self::Packages(packages)
        }
    }

    /// Extend with another `NoBinary`.
    pub fn extend(&mut self, other: Self) {
        match other {
            Self::None => {}
            Self::All => *self = Self::All,
            Self::Packages(pkgs) => match self {
                Self::All => {}
                Self::None => *self = Self::Packages(pkgs),
                Self::Packages(existing) => existing.extend(pkgs),
            },
        }
    }

    pub fn is_none(&self) -> bool {
        matches!(self, Self::None)
    }
}

/// Whether to allow building source distributions.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub enum NoBuild {
    /// Allow all builds.
    #[default]
    None,
    /// Disallow all builds.
    All,
    /// Disallow specific packages' builds.
    Packages(Vec<PackageName>),
}

impl NoBuild {
    /// Construct from a single pip-style specifier.
    pub fn from_pip_arg(specifier: PackageNameSpecifier) -> Self {
        Self::from_pip_args(vec![specifier], false)
    }

    /// Construct from pip-style specifiers.
    pub fn from_pip_args(specifiers: Vec<PackageNameSpecifier>, no_build: bool) -> Self {
        if no_build {
            return Self::All;
        }
        let mut packages = Vec::new();
        for spec in specifiers {
            match spec {
                PackageNameSpecifier::All => return Self::All,
                PackageNameSpecifier::None => return Self::None,
                PackageNameSpecifier::Package(name) => packages.push(name),
            }
        }
        if packages.is_empty() {
            Self::None
        } else {
            Self::Packages(packages)
        }
    }

    /// Extend with another `NoBuild`.
    pub fn extend(&mut self, other: Self) {
        match other {
            Self::None => {}
            Self::All => *self = Self::All,
            Self::Packages(pkgs) => match self {
                Self::All => {}
                Self::None => *self = Self::Packages(pkgs),
                Self::Packages(existing) => existing.extend(pkgs),
            },
        }
    }

    pub fn is_none(&self) -> bool {
        matches!(self, Self::None)
    }
}
