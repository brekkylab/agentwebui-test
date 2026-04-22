mod calculate;
mod find;
mod read;
mod search;

use ailoy::tool::ToolSet;

pub use calculate::*;
pub use find::*;
pub use read::*;
pub use search::*;

use crate::knowledge::Knowledge;

pub fn build_toolset(store: Knowledge) -> ToolSet {
    let mut toolset = ToolSet::new();

    let (desc, func) = make_search_document_tool(store.clone());
    toolset.insert("search_document", desc, func);
    let (desc, func) = build_find_in_document_tool(store.clone());
    toolset.insert("find_in_document", desc, func);
    let (desc, func) = build_read_document_tool(store.clone());
    toolset.insert("read_document", desc, func);
    let (desc, func) = build_calculate_tool();
    toolset.insert("calculate", desc, func);
    toolset
}
