use std::path::PathBuf;

use ailoy::message::Message;

pub struct Case {
    pub query: Message,
    pub files: Vec<(Vec<u8>, PathBuf)>,
}

mod coworker;
mod deep_research;

pub use coworker::get_coworker_cases;
pub use deep_research::get_deep_research_cases;
