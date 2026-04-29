use std::sync::Arc;

use ailoy::agent::Agent;
use ailoy::tool::ToolSet;
use dashmap::DashMap;
use speedwagon::SharedStore;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::repository::AppRepository;

pub struct AppState {
    agents: DashMap<Uuid, Arc<Mutex<Agent>>>,
    pub repository: AppRepository,
    pub store: SharedStore,
    pub toolset: Arc<ToolSet>,
}

impl AppState {
    pub fn new(repository: AppRepository, store: SharedStore, toolset: ToolSet) -> Self {
        Self {
            agents: DashMap::new(),
            repository,
            store,
            toolset: Arc::new(toolset),
        }
    }

    pub fn insert_agent(&self, id: Uuid, agent: Agent) {
        self.agents.insert(id, Arc::new(Mutex::new(agent)));
    }

    pub fn remove_agent(&self, id: &Uuid) -> Option<Arc<Mutex<Agent>>> {
        self.agents.remove(id).map(|(_, v)| v)
    }

    pub fn get_agent(&self, id: &Uuid) -> Option<Arc<Mutex<Agent>>> {
        self.agents.get(id).map(|entry| entry.value().clone())
    }
}
