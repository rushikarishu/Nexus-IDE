export interface GitFileStatus {
    path: string;
    status: string;
    staged: boolean;
}

export interface GitStatus {
    branch: string;
    files: GitFileStatus[];
}

export interface GitBranch {
    name: string;
    active: boolean;
}

export interface GitCommit {
    hash: string;
    author: string;
    date: string;
    message: string;
}

export interface GitBlame {
    line: number;
    commit_hash: string;
    author: string;
    summary: string;
}

export interface GitStash {
    index: number;
    message: string;
}
