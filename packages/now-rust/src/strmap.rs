use std::{
    collections::{hash_map::Keys, HashMap},
    fmt,
    sync::Arc,
};

use serde::de::{Deserialize, Deserializer, MapAccess, Visitor};

/// A read-only view into a map of string data
#[derive(Default, Debug, PartialEq)]
pub struct StrMap(pub(crate) Arc<HashMap<String, String>>);

impl StrMap {
    /// Return a named value where available
    pub fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).map(|value| value.as_ref())
    }

    /// Return true if the underlying map is empty
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Return an iterator over keys and values
    pub fn iter(&self) -> StrMapIter<'_> {
        StrMapIter {
            data: self,
            keys: self.0.keys(),
        }
    }
}

impl Clone for StrMap {
    fn clone(&self) -> Self {
        // only clone the inner data
        StrMap(self.0.clone())
    }
}
impl From<HashMap<String, String>> for StrMap {
    fn from(inner: HashMap<String, String>) -> Self {
        StrMap(Arc::new(inner))
    }
}

/// A read only reference to `StrMap` key and value slice pairings
pub struct StrMapIter<'a> {
    data: &'a StrMap,
    keys: Keys<'a, String, String>,
}

impl<'a> Iterator for StrMapIter<'a> {
    type Item = (&'a str, &'a str);

    #[inline]
    fn next(&mut self) -> Option<(&'a str, &'a str)> {
        self.keys
            .next()
            .and_then(|k| self.data.get(k).map(|v| (k.as_str(), v)))
    }
}

impl<'de> Deserialize<'de> for StrMap {
    fn deserialize<D>(deserializer: D) -> Result<StrMap, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct StrMapVisitor;

        impl<'de> Visitor<'de> for StrMapVisitor {
            type Value = StrMap;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(formatter, "a StrMap")
            }

            fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
            where
                A: MapAccess<'de>,
            {
                let mut inner = HashMap::new();
                while let Some((key, value)) = map.next_entry()? {
                    inner.insert(key, value);
                }
                Ok(StrMap(Arc::new(inner)))
            }
        }

        deserializer.deserialize_map(StrMapVisitor)
    }
}
