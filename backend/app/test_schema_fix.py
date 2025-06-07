import logging
import os
import sys
import json
import sqlite3

# Adjust sys.path to allow imports from the 'backend' directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

try:
    from backend.app.services.configure_service import ConfigureService
    from backend.app.configure_schemas import Tool, AgentInfo # Tool might not be directly used now but good for context
    import litellm
except ImportError as e:
    logging.error(f"Failed to import necessary modules: {e}")
    sys.exit(1)

# --- Logging Setup ---
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
c_handler = logging.StreamHandler(sys.stdout)
f_handler = logging.FileHandler('/tmp/test_schema_fix.log', mode='w')
c_handler.setLevel(logging.INFO)
f_handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
c_handler.setFormatter(formatter)
f_handler.setFormatter(formatter)
logger.addHandler(c_handler)
logger.addHandler(f_handler)

# --- Database Pre-population ---
def setup_database_with_problematic_tool(db_path):
    logger.info(f"Setting up database at {db_path} with a 'create_entities' tool having 'STRING' types.")

    # Define the create_entities tool schema with "STRING" types
    create_entities_tool_data = {
        "name": "create_entities",
        "type": "function", # Matches the 'Tool' Pydantic model's 'type' field
        "tool_schema": {    # This is the dict that ConfigureService will process
            "name": "create_entities", # Function name for LLM
            "description": "Creates entities based on input.", # Function description for LLM
            "parameters": { # OpenAI/LiteLLM parameters schema object
                "type": "object",
                "properties": {
                    "entity_name": {
                        "type": "STRING",  # Problematic type
                        "description": "Name of the entity"
                    },
                    "entity_type": {
                        "type": "string", # Correct type
                        "description": "Type of the entity"
                    },
                    "attributes": {
                        "type": "array",
                        "items": {
                            "type": "STRING", # Problematic type in array items
                            "description": "Attribute value"
                        }
                    }
                },
                "required": ["entity_name"]
            }
        }
    }

    tools_list = [create_entities_tool_data]
    tools_json_string = json.dumps(tools_list)

    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Ensure agent_info table exists (simplified version of ConfigureService's init)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS agent_info (
                key               INTEGER PRIMARY KEY,
                name              TEXT    NOT NULL,
                description       TEXT    NOT NULL,
                model_name        TEXT    NOT NULL,
                model_parameters  TEXT    NOT NULL,
                tools             TEXT DEFAULT '[]'
            )
        """)
        # Ensure 'tools' column exists if table was created by an older version (match ConfigureService logic)
        cursor.execute("PRAGMA table_info(agent_info)")
        columns = [column_info[1] for column_info in cursor.fetchall()]
        if "tools" not in columns:
            cursor.execute("ALTER TABLE agent_info ADD COLUMN tools TEXT DEFAULT '[]'")

        # Insert/replace the agent configuration with the problematic tool
        agent_name = "test_agent_for_schema_fix"
        agent_description = "Test agent"
        model_name = "gpt-3.5-turbo" # Example
        model_parameters_json = json.dumps({})

        cursor.execute("""
            INSERT OR REPLACE INTO agent_info
            (key, name, description, model_name, model_parameters, tools)
            VALUES (1, ?, ?, ?, ?, ?)
        """, (agent_name, agent_description, model_name, model_parameters_json, tools_json_string))

        conn.commit()
        logger.info(f"Database setup complete. Agent '{agent_name}' with 'create_entities' tool (having 'STRING' types) inserted/updated.")

    except sqlite3.Error as e:
        logger.error(f"SQLite error during database setup: {e}", exc_info=True)
        raise # Re-raise to stop the script if DB setup fails
    finally:
        if conn:
            conn.close()

# --- Main Test Logic ---
def main():
    logger.info("Starting test_schema_fix.py script.")

    if not os.getenv("OPENAI_API_KEY"):
        os.environ["OPENAI_API_KEY"] = "dummy_key_for_schema_validation_test"
        logger.info("Set dummy OPENAI_API_KEY for litellm.")

    db_path = "/tmp/capy_agent_test.db"
    # Clean up any old DB file before setup
    if os.path.exists(db_path):
        os.remove(db_path)
        logger.info(f"Removed existing database file at {db_path}.")

    try:
        setup_database_with_problematic_tool(db_path)
    except Exception as e:
        logger.error("Failed to setup database. Exiting test.")
        return

    config_service = ConfigureService(db_url=db_path) # ConfigureService expects just the path
    logger.info("ConfigureService instantiated.")

    # This call should trigger the schema correction in ConfigureService
    agent_info: AgentInfo = config_service.get_agent_info()
    logger.info("get_agent_info() called successfully.")

    create_entities_tool_corrected = None
    if agent_info and agent_info.tools:
        for tool_obj in agent_info.tools: # tool_obj is of type Tool (Pydantic model)
            if tool_obj.name == "create_entities":
                create_entities_tool_corrected = tool_obj
                logger.info(f"Found 'create_entities' tool from ConfigureService: {tool_obj.model_dump_json(indent=2)}")
                break

    litellm_bad_request_error_occurred = False
    if not create_entities_tool_corrected:
        logger.error("'create_entities' tool not found after ConfigureService processing. This is unexpected if DB setup was correct.")
    else:
        # The `tool_schema` attribute of our `Tool` Pydantic model holds the actual
        # function definition (name, description, parameters) that litellm expects for "function".
        # The fix in ConfigureService modifies `tool.tool_schema["parameters"]["properties"]`.
        # So, `create_entities_tool_corrected.tool_schema` should be the complete function definition
        # that litellm needs.

        litellm_tool_definition = create_entities_tool_corrected.tool_schema
        if not isinstance(litellm_tool_definition, dict) or "parameters" not in litellm_tool_definition:
             logger.error(f"The 'tool_schema' for 'create_entities' is not structured as expected by litellm (missing 'parameters' key directly within tool_schema). Schema: {litellm_tool_definition}")
        else:
            # Check if the types were corrected in the schema that litellm will receive
            try:
                params_props = litellm_tool_definition["parameters"]["properties"]
                entity_name_type = params_props.get("entity_name", {}).get("type")
                attributes_items_type = params_props.get("attributes", {}).get("items", {}).get("type")
                logger.info(f"Verifying corrected types in schema for litellm: entity_name type is '{entity_name_type}', attributes items type is '{attributes_items_type}'")
                if entity_name_type != "string" or attributes_items_type != "string":
                    logger.warning("SCHEMA TYPES FOR LITELLM DO NOT APPEAR CORRECTED TO 'string'!")
            except KeyError:
                logger.warning("Could not verify corrected types in schema for litellm due to unexpected structure.")


            litellm_tools_arg = [{
                "type": "function",
                "function": litellm_tool_definition # Pass the entire tool_schema dict
            }]
            logger.info(f"Schema being passed to litellm: {json.dumps(litellm_tools_arg, indent=2)}")

            messages = [{"role": "user", "content": "Create an entity named 'test'."}]
            try:
                logger.info("Calling litellm.completion...")
                response = litellm.completion(
                    model="gpt-3.5-turbo",
                    messages=messages,
                    tools=litellm_tools_arg,
                    mock_response="This is a mock response for schema validation test." # Avoids actual API call if possible
                )
                logger.info(f"litellm.completion call processed. Response: {response}")
            except litellm.BadRequestError as e:
                logger.error(f"litellm.BadRequestError occurred: {e}", exc_info=True) # Log full traceback
                if "Invalid schema for function 'create_entities'" in str(e) and "'STRING' is not valid" in str(e):
                    litellm_bad_request_error_occurred = True
                    logger.error("THE SPECIFIC BADREQUESTERROR RELATED TO 'STRING' TYPE OCCURRED!")
                else:
                    logger.info("litellm.BadRequestError was not the specific one about 'STRING' type for create_entities.")
            except litellm.AuthenticationError as e:
                logger.warning(f"litellm.AuthenticationError: {e}. This is acceptable if schema validation passed before key check.")
            except Exception as e: # Catch any other litellm or general errors
                logger.error(f"An unexpected error occurred during litellm.completion: {e}", exc_info=True) # Log full traceback

    logger.info(f"Final check: Specific litellm.BadRequestError for 'STRING' type occurred: {litellm_bad_request_error_occurred}")
    logger.info("Test completed. Check /tmp/test_schema_fix.log and stdout for details, including ConfigureService logs if any.")

if __name__ == "__main__":
    main()
