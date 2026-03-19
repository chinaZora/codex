from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.logging import setup_logging
from app.routers import health, agents, knowledge, memory, tools, sessions, audit, artifacts

setup_logging()

app = FastAPI(title='HR Agent Platform API', version='0.1.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)
app.include_router(health.router)
app.include_router(agents.router)
app.include_router(knowledge.router)
app.include_router(memory.router)
app.include_router(tools.router)
app.include_router(sessions.router)
app.include_router(audit.router)
app.include_router(artifacts.router)
