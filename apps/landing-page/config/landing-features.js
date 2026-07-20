'use strict';

class LandingFeatureCatalog {
  static #FEATURES;

  static {
    const definitions = [
      {
        id: 'home',
        name: 'Home do aplicativo',
        title: 'Encontre tudo logo na primeira tela',
        description: 'A Home apresenta barbearias, profissionais, conteúdos e atalhos para que o cliente encontre rapidamente o que procura.',
        benefits: [
          'Acesso rápido às barbearias.',
          'Visualização dos stories.',
          'Navegação simples.',
        ],
        placeholder: '[PRINT REAL — HOME DO BARBERFLOW]',
        image: 'assets/images/screenshots/home-barberflow.webp',
        imageAlt: 'Tela inicial do aplicativo BarberFlow com barbearias, profissionais, stories e atalhos.',
        imageReady: true,
      },
      {
        id: 'barbearia-publica',
        name: 'Barbearia pública',
        title: 'A fila visível para o cliente',
        description: 'O cliente acessa a página pública, verifica quais profissionais estão disponíveis e consulta quantas pessoas estão esperando.',
        benefits: [
          'Mais transparência.',
          'Menos perguntas repetidas.',
          'Melhor planejamento do cliente.',
        ],
        placeholder: '[PRINT REAL — BARBEARIA PÚBLICA]',
        image: 'assets/images/screenshots/barbearia-publica.webp',
        imageAlt: 'Página pública da barbearia com profissionais disponíveis e situação da fila.',
        imageReady: true,
      },
      {
        id: 'cadeiras-fila',
        name: 'Cadeiras e fila em tempo real',
        title: 'Entre na próxima cadeira disponível',
        description: 'O cliente seleciona uma cadeira vazia e passa a ocupar sua posição na fila, respeitando a ordem de chegada.',
        benefits: [
          'Ordem de atendimento organizada.',
          'Atualização em tempo real.',
          'Experiência mais simples.',
        ],
        placeholder: '[PRINT REAL — CADEIRAS E FILA]',
        image: 'assets/images/screenshots/cadeiras-fila.webp',
        imageAlt: 'Tela de cadeiras disponíveis e fila em tempo real do BarberFlow.',
        imageReady: true,
      },
      {
        id: 'minha-barbearia',
        name: 'Minha Barbearia',
        title: 'Controle sua operação em um só lugar',
        description: 'A área Minha Barbearia permite acompanhar equipe, presença, cadeiras, clientes e diferentes partes da operação.',
        benefits: [
          'Visão centralizada.',
          'Mais controle.',
          'Acesso rápido às ferramentas.',
        ],
        placeholder: '[PRINT REAL — MINHA BARBEARIA]',
        image: 'assets/images/screenshots/minha-barbearia.webp',
        imageAlt: 'Área Minha Barbearia com visão centralizada da operação.',
        imageReady: true,
      },
      {
        id: 'presenca-barbeiros',
        name: 'Presença dos barbeiros',
        title: 'Mostre quem está disponível',
        description: 'O status de presença ajuda o cliente a identificar quais profissionais estão atendendo naquele momento.',
        benefits: [
          'Informação atualizada.',
          'Mais confiança para o cliente.',
          'Melhor organização da equipe.',
        ],
        placeholder: '[PRINT REAL — PRESENÇA DOS BARBEIROS]',
        image: 'assets/images/screenshots/presenca-barbeiros.webp',
        imageAlt: 'Tela de presença dos barbeiros com status dos profissionais.',
        imageReady: true,
      },
      {
        id: 'stories',
        name: 'Stories',
        title: 'Mostre o movimento da sua barbearia',
        description: 'Publique vídeos curtos para divulgar cortes, novidades, ambiente, horários e trabalhos recentes.',
        benefits: [
          'Conteúdo com duração limitada.',
          'Mais proximidade com o cliente.',
          'Divulgação dentro do aplicativo.',
        ],
        placeholder: '[PRINT REAL — STORIES COM TRÊS CARDS]',
        image: 'assets/images/screenshots/stories.webp',
        imageAlt: 'Stories do BarberFlow apresentados em três cards.',
        imageReady: true,
      },
      {
        id: 'portfolio',
        name: 'Portfólio',
        title: 'Transforme seus trabalhos em uma vitrine',
        description: 'Organize fotos dos cortes e apresente seu trabalho para clientes que ainda não conhecem a barbearia.',
        benefits: [
          'Exposição profissional.',
          'Valorização dos cortes.',
          'Mais confiança na escolha.',
        ],
        placeholder: '[PRINT REAL — PORTFÓLIO]',
        image: 'assets/images/screenshots/portfolio.webp',
        imageAlt: 'Portfólio profissional com fotos de cortes realizados.',
        imageReady: true,
      },
      {
        id: 'chatflow',
        name: 'ChatFlow',
        title: 'Converse com o cliente dentro do aplicativo',
        description: 'O ChatFlow oferece um canal para tirar dúvidas e facilitar a comunicação entre cliente e profissional.',
        benefits: [
          'Comunicação centralizada.',
          'Confirmação de envio e leitura.',
          'Mais praticidade.',
        ],
        placeholder: '[PRINT REAL — CHATFLOW]',
        image: 'assets/images/screenshots/chatflow.webp',
        imageAlt: 'Conversa entre cliente e profissional na tela do ChatFlow.',
        imageReady: true,
      },
      {
        id: 'mapa',
        name: 'Mapa',
        title: 'Ajude novos clientes a encontrar sua barbearia',
        description: 'O perfil apresenta a localização da barbearia no mapa, facilitando a chegada de quem ainda não conhece o endereço.',
        benefits: [
          'Endereço mais fácil de localizar.',
          'Melhor experiência para novos clientes.',
          'Pesquisa por proximidade.',
        ],
        placeholder: '[PRINT REAL — MAPA]',
        image: 'assets/images/screenshots/mapa.webp',
        imageAlt: 'Mapa do BarberFlow indicando a localização da barbearia.',
        imageReady: true,
      },
      {
        id: 'convite-parceiro',
        name: 'Convite para barbeiro parceiro',
        title: 'Monte sua equipe pelo BarberFlow',
        description: 'A barbearia pode enviar uma proposta para convidar um profissional e definir as condições da parceria.',
        benefits: [
          'Convite organizado.',
          'Condições mais claras.',
          'Integração da equipe.',
        ],
        placeholder: '[PRINT REAL — CONVITE PARA PARCEIRO]',
        image: 'assets/images/screenshots/convite-barbeiro-parceiro.webp',
        imageAlt: 'Proposta de convite para barbeiro parceiro no BarberFlow.',
        imageReady: false,
      },
      {
        id: 'card-whatsapp',
        name: 'Card para WhatsApp',
        title: 'Compartilhe sua fila com poucos toques',
        description: 'O profissional pode enviar um card ou link para o cliente acessar a página pública e acompanhar a fila.',
        benefits: [
          'Compartilhamento rápido.',
          'Acesso direto à fila.',
          'Menos explicações manuais.',
        ],
        placeholder: '[PRINT REAL — COMPARTILHAMENTO NO WHATSAPP]',
        image: 'assets/images/screenshots/card-whatsapp.webp',
        imageAlt: 'Card do BarberFlow preparado para compartilhamento no WhatsApp.',
        imageReady: true,
      },
      {
        id: 'financas',
        name: 'Finanças',
        title: 'Entenda os resultados da sua barbearia',
        description: 'A área financeira ajuda a acompanhar cortes, receitas e divisões entre a barbearia e os profissionais parceiros.',
        benefits: [
          'Visão financeira organizada.',
          'Acompanhamento dos atendimentos.',
          'Divisões mais transparentes.',
        ],
        placeholder: '[PRINT REAL — FINANÇAS]',
        image: 'assets/images/screenshots/financas.webp',
        imageAlt: 'Área financeira do BarberFlow com resultados da barbearia.',
        imageReady: true,
      },
    ];

    LandingFeatureCatalog.#FEATURES = Object.freeze(
      definitions.map((feature) => Object.freeze({
        ...feature,
        benefits: Object.freeze([...feature.benefits]),
      })),
    );
  }

  static all() {
    return LandingFeatureCatalog.#FEATURES;
  }
}

globalThis.LandingFeatureCatalog = LandingFeatureCatalog;
