import { Box, Flex, Input, IconButton, Text } from "@chakra-ui/react";
import { LuFolderOpen } from "react-icons/lu";
import { open } from "@tauri-apps/plugin-dialog";

interface SqliteFieldsProps {
  dbName: string;
  onDbNameChange: (next: string) => void;
}

/** SQLite-specific fields: file path input + browse-via-OS-dialog
 * button. The OS dialog filter narrows to `.db` / `.sqlite` /
 * `.sqlite3` to match the driver's expected extensions. */
export function SqliteFields({ dbName, onDbNameChange }: SqliteFieldsProps) {
  return (
    <Box>
      <Text fontSize="2xs" color="fg.muted" mb={1}>
        FILE PATH
      </Text>
      <Flex gap={1}>
        <Input
          size="sm"
          flex={1}
          value={dbName}
          onChange={(e) => onDbNameChange(e.target.value)}
          placeholder="/path/to/database.db"
          fontFamily="mono"
          fontSize="xs"
        />
        <IconButton
          aria-label="Browse"
          size="sm"
          variant="outline"
          onClick={async () => {
            const selected = await open({
              multiple: false,
              filters: [
                {
                  name: "SQLite",
                  extensions: ["db", "sqlite", "sqlite3"],
                },
                { name: "All", extensions: ["*"] },
              ],
            });
            if (selected) onDbNameChange(selected as string);
          }}
        >
          <LuFolderOpen />
        </IconButton>
      </Flex>
    </Box>
  );
}
