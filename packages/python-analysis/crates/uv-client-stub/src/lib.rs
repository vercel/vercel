/// Network connectivity mode.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum Connectivity {
    /// Allow access to the network.
    Online,
    /// Do not allow access to the network.
    #[default]
    Offline,
}

impl Connectivity {
    pub fn is_online(&self) -> bool {
        matches!(self, Self::Online)
    }

    pub fn is_offline(&self) -> bool {
        matches!(self, Self::Offline)
    }
}

/// Minimal client builder stub — WASM is always offline.
#[derive(Debug, Default, Clone)]
pub struct BaseClientBuilder<'a> {
    pub connectivity: Connectivity,
    _marker: std::marker::PhantomData<&'a ()>,
}

impl<'a> BaseClientBuilder<'a> {
    pub fn connectivity(mut self, connectivity: Connectivity) -> Self {
        self.connectivity = connectivity;
        self
    }

    pub fn is_offline(&self) -> bool {
        self.connectivity.is_offline()
    }
}
